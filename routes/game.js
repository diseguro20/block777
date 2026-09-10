import express from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { allocatePromotionalBet, allocatePromotionalPayout, getWalletBuckets } from '../lib/promotion.js';
import { calculateGgrEntry, DEFAULT_MANAGER_GGR_RATE, managerPeriod, normalizeGgrRate } from '../lib/ggr.js';
import { DEFAULT_TENANT_ID, belongsToTenant, tenantSettingsRef } from '../lib/tenant.js';
import { updateAdminSummary } from '../lib/adminSummary.js';
import { createVizzionPix, isVizzionPaid, parseVizzionWebhook, verifyVizzionTransactionWithRetry, vizzionAmountMatches, vizzionTransactionStatus } from '../lib/vizzionpay.js';

const router = express.Router();
const REWARD_TARGET_MULTIPLIER = 10;
const BOOST_PRICE = 4000;
const BOOST_RATE = 3;
const BOOST_MAX_MULTIPLIER = 30;
const BOOST_TRIGGER_LINES = 3;

async function findPendingBet(uid, sessionId) {
  const snapshot = await db.collection('bets')
    .where('uid', '==', uid)
    .where('sessionId', '==', sessionId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  return snapshot.empty ? null : snapshot.docs[0];
}

async function activatePaidBoost(boostRef, verifiedStatus = 'COMPLETED') {
  return db.runTransaction(async transaction => {
    const boostDoc = await transaction.get(boostRef);
    if (!boostDoc.exists) throw new Error('Boost não encontrado.');
    const boost = boostDoc.data();
    if (boost.status === 'approved') return { status: 'approved', alreadyApproved: true, boostRate: boost.boost_rate || BOOST_RATE, boostMaxMultiplier: boost.boost_max_multiplier || BOOST_MAX_MULTIPLIER };
    const betRef = db.collection('bets').doc(boost.bet_id);
    const userRef = db.collection('users').doc(boost.uid);
    const [betDoc, userDoc] = await Promise.all([transaction.get(betRef), transaction.get(userRef)]);
    if (!userDoc.exists) throw new Error('Jogador não encontrado.');

    if (!betDoc.exists || betDoc.data().status !== 'pending') {
      const wallet = getWalletBuckets(userDoc.data());
      const refundedCash = wallet.cashBalance + BOOST_PRICE;
      const refundedBalance = refundedCash + wallet.bonusBalance;
      transaction.update(userRef, { balance: refundedBalance, cash_balance: refundedCash });
      transaction.update(boostRef, {
        status: 'refunded_to_wallet',
        gateway_status: verifiedStatus,
        refunded_amount: BOOST_PRICE,
        refunded_balance: refundedBalance,
        refunded_at: FieldValue.serverTimestamp()
      });
      transaction.set(db.collection('transactions').doc(), {
        uid: boost.uid,
        tenant_id: boost.tenant_id || DEFAULT_TENANT_ID,
        type: 'boost_refund',
        amount: BOOST_PRICE,
        status: 'completed',
        balance_after: refundedBalance,
        reference_id: boostRef.id,
        created_at: FieldValue.serverTimestamp()
      });
      updateAdminSummary(transaction, boost.tenant_id || DEFAULT_TENANT_ID, { totalWalletBalance: BOOST_PRICE });
      return { status: 'refunded_to_wallet', balance: refundedBalance };
    }

    transaction.update(boostRef, {
      status: 'approved',
      gateway_status: verifiedStatus,
      credit_applied: true,
      approved_at: FieldValue.serverTimestamp()
    });
    transaction.update(betRef, {
      boost_active: true,
      boost_rate: BOOST_RATE,
      boost_amount: BOOST_PRICE,
      boost_max_multiplier: BOOST_MAX_MULTIPLIER,
      boost_activated_at: FieldValue.serverTimestamp()
    });
    transaction.set(db.collection('transactions').doc(), {
      uid: boost.uid,
      tenant_id: boost.tenant_id || DEFAULT_TENANT_ID,
      type: 'game_boost_purchase',
      amount: 0,
      external_amount: BOOST_PRICE,
      status: 'completed',
      reference_id: boostRef.id,
      created_at: FieldValue.serverTimestamp()
    });
    return { status: 'approved', boostRate: BOOST_RATE, boostMaxMultiplier: BOOST_MAX_MULTIPLIER };
  });
}

function recordManagerMetric(transaction, managerId, period, entry, won, tenantId = DEFAULT_TENANT_ID) {
  if (!managerId) return;
  const metricRef = db.collection('manager_metrics').doc(`${managerId}_${period}`);
  transaction.set(metricRef, {
    manager_id: managerId,
    tenant_id: tenantId,
    period,
    total_bets: FieldValue.increment(entry.betAmount),
    total_payouts: FieldValue.increment(entry.payout),
    ggr: FieldValue.increment(entry.ggr),
    platform_fee: FieldValue.increment(entry.platformFee),
    games: FieldValue.increment(1),
    wins: FieldValue.increment(won ? 1 : 0),
    losses: FieldValue.increment(won ? 0 : 1),
    updated_at: FieldValue.serverTimestamp()
  }, { merge: true });
}

router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const uid = req.user.uid;
    const tenantId = req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID;
    const userRef = db.collection('users').doc(uid);

    // Consulta de configurações e apostas pendentes antes da transação para evitar conflitos no Firestore
    let difficulty = 'impossible';
    let minBet = 100;
    let maxBet = 10000;
    let maintenance = false;
    let defaultManagerGgrRate = DEFAULT_MANAGER_GGR_RATE;
    try {
      const settingsDoc = await tenantSettingsRef(tenantId).get();
      if (settingsDoc.exists) {
        const settings = settingsDoc.data();
        difficulty = settings.difficulty || 'impossible';
        minBet = settings.minBet ?? minBet;
        maxBet = settings.maxBet ?? maxBet;
        maintenance = Boolean(settings.maintenance);
        defaultManagerGgrRate = normalizeGgrRate(settings.defaultManagerGgrRate, DEFAULT_MANAGER_GGR_RATE);
      }
    } catch (e) {}
    if (maintenance) return res.status(503).json({ error: 'As apostas estão temporariamente pausadas.' });
    if (!amount || amount < minBet || amount > maxBet) {
      return res.status(400).json({ error: `A aposta deve ficar entre R$ ${(minBet / 100).toFixed(2)} e R$ ${(maxBet / 100).toFixed(2)}.` });
    }

    const pendingBets = await db.collection('bets')
      .where('uid', '==', uid)
      .where('status', '==', 'pending')
      .get();

    const sessionId = uuidv4();
    const seed = crypto.randomBytes(32).toString('hex');
    const seedHash = crypto.createHash('sha256').update(seed).digest('hex');

    const result = await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error('Usuário não encontrado');

      const userData = userDoc.data();
      if (!belongsToTenant(userData, tenantId)) throw new Error('Conta não pertence a esta operação.');
      const wallet = getWalletBuckets(userData);
      if (wallet.balance < amount) throw new Error('Saldo insuficiente para realizar a aposta.');

      const demoAccount = Boolean(userData.demo_account);
      const influencerMode = Number(userData.is_influencer) === 1;
      let managerId = demoAccount ? null : (userData.manager_id || null);
      let managerGgrRate = defaultManagerGgrRate;
      if (managerId) {
        const managerDoc = await t.get(db.collection('users').doc(managerId));
        if (!managerDoc.exists || !belongsToTenant(managerDoc.data(), tenantId) || managerDoc.data().role !== 'manager' || managerDoc.data().status !== 'active') {
          managerId = null;
        } else {
          managerGgrRate = normalizeGgrRate(managerDoc.data().manager_ggr_rate, defaultManagerGgrRate);
        }
      }

      if (influencerMode) {
        difficulty = 'easy';
      } else {
        // Jogador normal: SEMPRE impossível
        difficulty = 'impossible';
      }

      // Marcar apostas anteriores pendentes como encerradas
      pendingBets.docs.forEach(betDoc => {
        const pending = betDoc.data();
        const pendingManagerId = pending.manager_id || null;
        const pendingEntry = calculateGgrEntry({
          betAmount: pending.amount,
          payout: 0,
          rate: pending.manager_ggr_rate ?? defaultManagerGgrRate
        });
        t.update(betDoc.ref, {
          status: 'completed',
          result: 'loss',
          payout: 0,
          multiplier: 0,
          blocksPlaced: 0,
          linesCleared: 0,
          manager_ggr: pendingEntry.ggr,
          manager_platform_fee: pendingEntry.platformFee,
          manager_period: managerPeriod(),
          completed_at: FieldValue.serverTimestamp()
        });
        recordManagerMetric(t, pendingManagerId, managerPeriod(), pendingEntry, false, tenantId);
      });

      const allocation = allocatePromotionalBet(wallet, amount);
      const {
        bonusStake,
        cashStake,
        balance: newBalance,
        bonusBalance: newBonusBalance,
        cashBalance: newCashBalance,
        rolloverRemaining: newRolloverRemaining,
        rolloverCompleted,
        unlockedBonus
      } = allocation;

      t.update(userRef, {
        balance: newBalance,
        cash_balance: newCashBalance,
        bonus_balance: newBonusBalance,
        rollover_remaining: newRolloverRemaining,
        ...(rolloverCompleted ? { rollover_target: 0, rollover_completed_at: FieldValue.serverTimestamp() } : {})
      });

      const betRef = db.collection('bets').doc();
      t.set(betRef, {
        uid,
        tenant_id: tenantId,
        amount,
        sessionId,
        seedHash,
        difficulty,
        status: 'pending',
        result: 'pending',
        blocksPlaced: 0,
        linesCleared: 0,
        score: 0,
        cashStake,
        bonusStake,
        manager_id: managerId,
        demo_manager_id: demoAccount ? (userData.manager_id || null) : null,
        is_demo: demoAccount,
        multiplier_profile: demoAccount ? 'demo' : 'standard',
        reward_target_multiplier: REWARD_TARGET_MULTIPLIER,
        boost_active: false,
        boost_rate: BOOST_RATE,
        boost_max_multiplier: BOOST_MAX_MULTIPLIER,
        early_cashout_enabled: influencerMode,
        manager_ggr_rate: managerGgrRate,
        rolloverCompleted,
        created_at: FieldValue.serverTimestamp()
      });
      if (!demoAccount) {
        updateAdminSummary(t, tenantId, {
          totalBets: amount,
          totalWalletBalance: -amount
        });
      }

      const txRef = db.collection('transactions').doc();
      t.set(txRef, {
        uid,
        tenant_id: tenantId,
        type: 'bet',
        amount: -amount,
        balance_after: newBalance,
        reference_id: betRef.id,
        created_at: FieldValue.serverTimestamp()
      });
      if (rolloverCompleted) {
        t.set(db.collection('transactions').doc(), {
          uid,
          tenant_id: tenantId,
          type: 'bonus_unlock',
          amount: 0,
          unlocked_amount: unlockedBonus,
          status: 'completed',
          balance_after: newBalance,
          reference_id: betRef.id,
          created_at: FieldValue.serverTimestamp()
        });
      }

      return {
        sessionId,
        seed: seedHash,
        difficulty,
        multiplierProfile: demoAccount ? 'demo' : 'standard',
        startingMultiplier: 1,
        rewardTargetMultiplier: REWARD_TARGET_MULTIPLIER,
        rewardTargetPayout: amount * REWARD_TARGET_MULTIPLIER,
        boostOffer: {
          price: BOOST_PRICE,
          rate: BOOST_RATE,
          maxMultiplier: BOOST_MAX_MULTIPLIER,
          triggerLines: BOOST_TRIGGER_LINES
        },
        allowEarlyCashout: influencerMode,
        balance_after: newBalance,
        rollover_remaining: newRolloverRemaining,
        rollover_completed: rolloverCompleted
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Game start error:', error);
    res.status(400).json({ error: error.message || 'Erro ao iniciar partida' });
  }
});

router.post('/boost/create', authenticateToken, async (req, res) => {
  let boostRef = null;
  try {
    const uid = req.user.uid;
    const tenantId = req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID;
    const { sessionId, linesCleared } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'Partida não informada.' });

    const betDoc = await findPendingBet(uid, sessionId);
    if (!betDoc || !belongsToTenant(betDoc.data(), tenantId)) {
      return res.status(404).json({ error: 'Partida ativa não encontrada.' });
    }
    const bet = betDoc.data();
    if (bet.is_demo) return res.status(403).json({ error: 'O boost não está disponível em contas demo.' });
    if (Math.floor(Number(linesCleared) || 0) < BOOST_TRIGGER_LINES) {
      return res.status(403).json({ error: 'O boost é liberado somente após completar 3 linhas.' });
    }

    boostRef = db.collection('game_boost_requests').doc(`boost_${betDoc.id}`);
    const existing = await boostRef.get();
    let retryExisting = false;
    if (existing.exists) {
      const boost = existing.data();
      if (boost.uid !== uid || !belongsToTenant(boost, tenantId)) return res.status(404).json({ error: 'Boost não encontrado.' });
      if (boost.status !== 'failed') {
        return res.json({
          boostId: boostRef.id,
          status: boost.status,
          pixCode: boost.pixCode || null,
          qrCodeUrl: boost.qrCodeUrl || null,
          amount: BOOST_PRICE,
          boostRate: BOOST_RATE,
          boostMaxMultiplier: BOOST_MAX_MULTIPLIER
        });
      }
      retryExisting = true;
    }

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || !belongsToTenant(userDoc.data(), tenantId)) return res.status(404).json({ error: 'Jogador não encontrado.' });
    const user = userDoc.data();

    const boostPayload = {
      uid,
      tenant_id: tenantId,
      bet_id: betDoc.id,
      session_id: sessionId,
      amount: BOOST_PRICE,
      boost_rate: BOOST_RATE,
      boost_max_multiplier: BOOST_MAX_MULTIPLIER,
      trigger_lines: BOOST_TRIGGER_LINES,
      status: 'creating',
      credit_applied: false,
      created_at: FieldValue.serverTimestamp()
    };
    if (retryExisting) await boostRef.set({ ...boostPayload, retried_at: FieldValue.serverTimestamp() }, { merge: true });
    else await boostRef.create(boostPayload);

    const protocol = String(req.get('host') || '').includes('localhost') ? req.protocol : 'https';
    const webhookUrl = `${protocol}://${req.get('host')}/api/game/boost/webhook/vizzionpay`;
    const charge = await createVizzionPix({
      amountCents: BOOST_PRICE,
      referenceId: boostRef.id,
      webhookUrl,
      customer: {
        name: user.username || req.user.email?.split('@')[0] || 'Jogador Blockerino',
        email: user.email || req.user.email
      }
    });
    const qrCodeUrl = charge.qrCodeUrl || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(charge.pixCode)}`;
    await boostRef.update({
      status: 'pending',
      gateway: 'vizzionpay',
      gatewayId: charge.gatewayId,
      gateway_status: charge.status,
      gateway_order_id: charge.orderId,
      pixCode: charge.pixCode,
      qrCodeUrl
    });

    res.json({
      boostId: boostRef.id,
      status: 'pending',
      pixCode: charge.pixCode,
      qrCodeUrl,
      amount: BOOST_PRICE,
      boostRate: BOOST_RATE,
      boostMaxMultiplier: BOOST_MAX_MULTIPLIER
    });
  } catch (error) {
    if (boostRef) await boostRef.set({ status: 'failed', error: String(error.message || error).slice(0, 240) }, { merge: true }).catch(() => {});
    console.error('Game boost creation error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Não foi possível gerar o PIX do boost.' });
  }
});

router.post('/boost/webhook/vizzionpay', async (req, res) => {
  try {
    const event = parseVizzionWebhook(req.body || {});
    let boostDoc = null;
    if (event.referenceId) {
      const direct = await db.collection('game_boost_requests').doc(event.referenceId).get();
      if (direct.exists) boostDoc = direct;
    }
    if (!boostDoc && event.gatewayId) {
      const snapshot = await db.collection('game_boost_requests').where('gatewayId', '==', event.gatewayId).limit(1).get();
      if (!snapshot.empty) boostDoc = snapshot.docs[0];
    }
    if (!boostDoc) return res.status(200).json({ received: true, warning: 'Boost not found' });
    if (['approved', 'refunded_to_wallet'].includes(boostDoc.data().status)) {
      return res.json({ received: true, status: boostDoc.data().status });
    }

    const boost = boostDoc.data();
    const verification = await verifyVizzionTransactionWithRetry({
      gatewayId: boost.gatewayId || event.gatewayId,
      referenceId: boostDoc.ref.id
    });
    if (!verification.transaction) {
      await boostDoc.ref.update({
        verification_attempts: FieldValue.increment(verification.attemptsCompleted),
        verification_pending_at: FieldValue.serverTimestamp(),
        last_webhook_event: event.event || null
      });
      return res.status(202).json({ received: true, status: 'verification_pending' });
    }
    if (!vizzionAmountMatches(verification.transaction, BOOST_PRICE)) {
      return res.status(409).json({ received: true, status: 'amount_mismatch' });
    }
    if (!isVizzionPaid(verification.transaction)) {
      const gatewayStatus = vizzionTransactionStatus(verification.transaction) || event.status || 'PENDING';
      await boostDoc.ref.update({ gateway_status: gatewayStatus });
      return res.json({ received: true, status: 'pending' });
    }

    const activation = await activatePaidBoost(boostDoc.ref, vizzionTransactionStatus(verification.transaction));
    return res.json({ received: true, ...activation });
  } catch (error) {
    console.error('Game boost webhook error:', error);
    return res.status(200).json({ received: true, error: error.message });
  }
});

router.get('/boost/check/:boostId', authenticateToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const tenantId = req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID;
    const boostRef = db.collection('game_boost_requests').doc(req.params.boostId);
    const boostDoc = await boostRef.get();
    if (!boostDoc.exists || boostDoc.data().uid !== uid || !belongsToTenant(boostDoc.data(), tenantId)) {
      return res.status(404).json({ error: 'Boost não encontrado.' });
    }
    const boost = boostDoc.data();
    if (boost.status === 'approved') return res.json({ status: 'approved', boostRate: BOOST_RATE, boostMaxMultiplier: BOOST_MAX_MULTIPLIER });
    if (boost.status === 'refunded_to_wallet') return res.json({ status: 'refunded_to_wallet', balance: boost.refunded_balance || null });
    if (boost.status !== 'pending') return res.json({ status: boost.status });

    const verification = await verifyVizzionTransactionWithRetry({
      gatewayId: boost.gatewayId,
      referenceId: boostRef.id,
      retryDelaysMs: [0]
    });
    if (!verification.transaction || !isVizzionPaid(verification.transaction)) return res.json({ status: 'pending' });
    if (!vizzionAmountMatches(verification.transaction, BOOST_PRICE)) return res.status(409).json({ error: 'O valor pago não corresponde ao boost.' });
    const activation = await activatePaidBoost(boostRef, vizzionTransactionStatus(verification.transaction));
    return res.json(activation);
  } catch (error) {
    console.error('Game boost check error:', error);
    return res.status(500).json({ error: error.message || 'Não foi possível verificar o boost.' });
  }
});

router.post('/end', authenticateToken, async (req, res) => {
  try {
    const { sessionId, floorsReached, multiplier, blocksPlaced, score } = req.body;
    if (!sessionId || multiplier == null) {
      return res.status(400).json({ error: 'Dados da partida incompletos' });
    }

    const uid = req.user.uid;
    const tenantId = req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID;
    const betsSnapshot = await db.collection('bets')
      .where('uid', '==', uid)
      .where('sessionId', '==', sessionId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (betsSnapshot.empty) {
      return res.status(400).json({ error: 'Aposta pendente não encontrada' });
    }

    const betDoc = betsSnapshot.docs[0];
    const betData = betDoc.data();
    if (!belongsToTenant(betData, tenantId)) return res.status(404).json({ error: 'Aposta não encontrada nesta operação.' });
    const rewardTargetMultiplier = Math.max(1, Math.min(Number(betData.reward_target_multiplier) || REWARD_TARGET_MULTIPLIER, REWARD_TARGET_MULTIPLIER));
    const requestedMultiplier = Math.max(0, Number(multiplier) || 0);
    // A permissão fica registrada no início da partida. O fallback por dificuldade
    // mantém partidas de influenciadores abertas antes desta versão compatíveis.
    const allowEarlyCashout = betData.early_cashout_enabled === true || betData.difficulty === 'easy';
    if (requestedMultiplier > 0 && requestedMultiplier < rewardTargetMultiplier && !allowEarlyCashout) {
      return res.status(403).json({
        error: `O resgate é liberado somente ao atingir ${rewardTargetMultiplier.toFixed(2)}x.`,
        rewardTargetMultiplier
      });
    }
    const safeLines = Math.max(0, Math.floor(Number(floorsReached) || 0));
    const safeBlocks = Math.max(0, Math.floor(Number(blocksPlaced) || 0));
    const safeScore = Math.max(0, Math.floor(Number(score) || 0));
    const period = managerPeriod();
    const userRef = db.collection('users').doc(uid);

    const result = await db.runTransaction(async (t) => {
      // A aposta é relida dentro da transação para não haver corrida entre a
      // confirmação do PIX do boost e o encerramento da partida.
      const [liveBetDoc, userDoc] = await Promise.all([t.get(betDoc.ref), t.get(userRef)]);
      if (!liveBetDoc.exists || liveBetDoc.data().status !== 'pending') throw new Error('A partida já foi encerrada');
      if (!userDoc.exists) throw new Error('Usuário não encontrado');
      if (!belongsToTenant(userDoc.data(), tenantId)) throw new Error('Conta não pertence a esta operação.');

      const liveBet = liveBetDoc.data();
      const liveTarget = Math.max(1, Math.min(Number(liveBet.reward_target_multiplier) || REWARD_TARGET_MULTIPLIER, REWARD_TARGET_MULTIPLIER));
      const liveEarlyCashout = liveBet.early_cashout_enabled === true || liveBet.difficulty === 'easy';
      if (requestedMultiplier > 0 && requestedMultiplier < liveTarget && !liveEarlyCashout) {
        throw new Error(`O resgate é liberado somente ao atingir ${liveTarget.toFixed(2)}x.`);
      }
      const boostActive = liveBet.boost_active === true;
      const maximumMultiplier = boostActive
        ? Math.max(liveTarget, Math.min(Number(liveBet.boost_max_multiplier) || BOOST_MAX_MULTIPLIER, BOOST_MAX_MULTIPLIER))
        : liveTarget;
      const finalMultiplier = requestedMultiplier >= liveTarget
        ? Math.min(requestedMultiplier, maximumMultiplier)
        : (liveEarlyCashout ? requestedMultiplier : 0);
      const payout = Math.floor(liveBet.amount * finalMultiplier);
      const resultLabel = payout > 0 ? 'win' : 'loss';
      const managerEntry = calculateGgrEntry({
        betAmount: liveBet.amount + (boostActive ? BOOST_PRICE : 0),
        payout,
        rate: liveBet.manager_ggr_rate ?? DEFAULT_MANAGER_GGR_RATE
      });

      const wallet = getWalletBuckets(userDoc.data());
      let newBalance = wallet.balance;
      let newCashBalance = wallet.cashBalance;
      let newBonusBalance = wallet.bonusBalance;

      t.update(betDoc.ref, {
        status: 'completed',
        result: resultLabel,
        floorsReached: safeLines,
        linesCleared: safeLines,
        blocksPlaced: safeBlocks,
        score: safeScore,
        multiplier: finalMultiplier,
        rewardTargetMultiplier: liveTarget,
        allowEarlyCashout: liveEarlyCashout,
        boostActive,
        boostRate: boostActive ? (Number(liveBet.boost_rate) || BOOST_RATE) : 1,
        maximumMultiplier,
        payout,
        manager_ggr: managerEntry.ggr,
        manager_platform_fee: managerEntry.platformFee,
        manager_period: period,
        completed_at: FieldValue.serverTimestamp()
      });
      recordManagerMetric(t, liveBet.manager_id, period, managerEntry, payout > 0, tenantId);
      if (!liveBet.is_demo) {
        updateAdminSummary(t, tenantId, {
          totalPayouts: payout,
          totalGames: 1,
          wins: payout > 0 ? 1 : 0,
          losses: payout > 0 ? 0 : 1,
          blocksPlaced: safeBlocks,
          linesCleared: safeLines,
          totalWalletBalance: payout
        });
      }

      if (payout > 0) {
        const payoutAllocation = allocatePromotionalPayout(wallet, payout, liveBet);
        const {
          bonusPayout,
          cashPayout,
          balance: payoutBalance,
          cashBalance: payoutCashBalance,
          bonusBalance: payoutBonusBalance
        } = payoutAllocation;
        newBalance = payoutBalance;
        newCashBalance = payoutCashBalance;
        newBonusBalance = payoutBonusBalance;
        t.update(userRef, {
          balance: newBalance,
          cash_balance: newCashBalance,
          bonus_balance: newBonusBalance
        });

        const txRef = db.collection('transactions').doc();
        t.set(txRef, {
          uid,
          tenant_id: tenantId,
          type: 'win',
          amount: payout,
          cash_amount: cashPayout,
          bonus_amount: bonusPayout,
          balance_after: newBalance,
          reference_id: betDoc.id,
          created_at: FieldValue.serverTimestamp()
        });
      }

      return {
        payout,
        balance_after: newBalance,
        multiplier: finalMultiplier,
        rewardTargetMultiplier: liveTarget,
        boostActive,
        boostRate: boostActive ? (Number(liveBet.boost_rate) || BOOST_RATE) : 1,
        maximumMultiplier,
        result: resultLabel,
        blocksPlaced: safeBlocks,
        linesCleared: safeLines,
        score: safeScore
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Game end error:', error);
    res.status(400).json({ error: error.message || 'Erro ao finalizar partida' });
  }
});

router.post('/demo/start', (req, res) => {
  const sessionId = uuidv4();
  const seed = crypto.randomBytes(32).toString('hex');
  const seedHash = crypto.createHash('sha256').update(seed).digest('hex');

  res.json({ sessionId, seed: seedHash, difficulty: 'easy' });
});

export default router;
