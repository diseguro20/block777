import express from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { createVizzionPix, getVizzionTransaction, parseVizzionWebhook, vizzionPayStatus } from '../lib/vizzionpay.js';
import { calculateDepositPromotion, getWalletBuckets, normalizePromotionSettings, PROMOTION_DEFAULTS } from '../lib/promotion.js';

const router = express.Router();
const tokenHash = value => crypto.createHash('sha256').update(String(value)).digest('hex');

async function getPromotionSettings() {
  const settingsRef = db.collection('settings').doc('global');
  const settingsDoc = await settingsRef.get();
  const settings = settingsDoc.exists ? settingsDoc.data() : {};
  if (settings.promotionVersion === PROMOTION_DEFAULTS.promotionVersion) return settings;
  const campaign = {
    promoEnabled: true,
    bonusPercent: PROMOTION_DEFAULTS.bonusPercent,
    bonusMinDeposit: PROMOTION_DEFAULTS.bonusMinDeposit,
    promotionVersion: PROMOTION_DEFAULTS.promotionVersion
  };
  await settingsRef.set(campaign, { merge: true });
  return { ...settings, ...campaign };
}

router.get('/promotion', async (req, res) => {
  try {
    res.json(normalizePromotionSettings(await getPromotionSettings()));
  } catch (_) {
    res.json(normalizePromotionSettings({}));
  }
});

router.post('/deposit', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    let minDeposit = 2000;
    let settings = {};
    try {
      settings = await getPromotionSettings();
      if (settings) {
        minDeposit = Math.max(2000, Number(settings.minDeposit) || 2000);
      }
    } catch (e) {}
    if (!amount || amount < minDeposit || amount > 100000) {
      return res.status(400).json({ error: `O depósito mínimo é de R$ ${(minDeposit / 100).toFixed(2).replace('.', ',')}.` });
    }
    const depositId = uuidv4();
    const promotion = calculateDepositPromotion(amount, settings);
    const docRef = db.collection('deposit_requests').doc();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const user = userDoc.exists ? userDoc.data() : {};
    if (user.demo_account) return res.status(403).json({ error: 'Contas demo utilizam saldo virtual e não aceitam depósitos.' });
    const webhookUrl = `${req.protocol}://${req.get('host')}/api/wallet/webhook/vizzionpay`;
    const charge = await createVizzionPix({
      amountCents: amount,
      referenceId: docRef.id,
      webhookUrl,
      customer: {
        name: user.username || req.user.email?.split('@')[0] || 'Jogador Blockerino',
        email: user.email || req.user.email
      }
    });

    await docRef.set({
      uid: req.user.uid,
      username: user.username || '',
      amount,
      pixCode: charge.pixCode,
      qrCodeUrl: charge.qrCodeUrl || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(charge.pixCode)}`,
      status: 'pending',
      depositId,
      gateway: 'vizzionpay',
      gatewayId: charge.gatewayId,
      gateway_status: charge.status,
      gateway_fee: charge.fee,
      gateway_order_id: charge.orderId,
      bonusAmount: promotion.bonusAmount,
      rolloverRequired: promotion.rolloverRequired,
      bonusPercent: promotion.bonusPercent,
      rolloverMultiplier: promotion.rolloverMultiplier,
      promotionEligible: promotion.eligible,
      created_at: FieldValue.serverTimestamp()
    });

    await db.collection('transactions').add({
      uid: req.user.uid,
      type: 'deposit',
      amount,
      status: 'pending',
      reference_id: docRef.id,
      gateway: 'vizzionpay',
      gateway_id: charge.gatewayId,
      created_at: FieldValue.serverTimestamp()
    });

    res.json({
      depositId,
      pixCode: charge.pixCode,
      qrCodeUrl: charge.qrCodeUrl || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(charge.pixCode)}`,
      gateway: 'vizzionpay',
      status: 'pending',
      bonusAmount: promotion.bonusAmount,
      totalAfterPayment: amount + promotion.bonusAmount,
      rolloverRequired: promotion.rolloverRequired
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Não foi possível gerar o PIX.' });
  }
});

export async function approveAndCreditDeposit(depositRef, verifiedStatus = 'COMPLETED') {
  return db.runTransaction(async transaction => {
    const depositDoc = await transaction.get(depositRef);
    if (!depositDoc.exists) throw new Error('Depósito não encontrado.');
    const deposit = depositDoc.data();
    if (deposit.status === 'approved') {
      const userDoc = await transaction.get(db.collection('users').doc(deposit.uid));
      return { alreadyApproved: true, balance: userDoc.exists ? userDoc.data().balance : 0 };
    }
    if (deposit.status !== 'pending') throw new Error('Depósito não está pendente.');

    const userRef = db.collection('users').doc(deposit.uid);
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) throw new Error('Usuário não encontrado.');
    const user = userDoc.data();
    const wallet = getWalletBuckets(user);

    const settingsDoc = await transaction.get(db.collection('settings').doc('global'));
    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const calculatedPromo = calculateDepositPromotion(deposit.amount, settings);

    const bonusAmount = (deposit.bonusAmount != null && Number(deposit.bonusAmount) > 0)
      ? Number(deposit.bonusAmount)
      : calculatedPromo.bonusAmount;

    const rolloverRequired = (deposit.rolloverRequired != null && Number(deposit.rolloverRequired) > 0)
      ? Number(deposit.rolloverRequired)
      : calculatedPromo.rolloverRequired;

    const newCashBalance = wallet.cashBalance + deposit.amount;
    const newBonusBalance = wallet.bonusBalance + bonusAmount;
    const newBalance = newCashBalance + newBonusBalance;
    const newRolloverRemaining = wallet.rolloverRemaining + rolloverRequired;
    const newRolloverTarget = (wallet.rolloverTarget || wallet.rolloverRemaining) + rolloverRequired;

    let affiliateRef = null;
    let affiliateDoc = null;
    let upperRef = null;
    let upperDoc = null;
    if (user.referred_by) {
      affiliateRef = db.collection('users').doc(user.referred_by);
      affiliateDoc = await transaction.get(affiliateRef);
      if (affiliateDoc.exists && affiliateDoc.data().referred_by) {
        upperRef = db.collection('users').doc(affiliateDoc.data().referred_by);
        upperDoc = await transaction.get(upperRef);
      }
    }

    transaction.update(depositRef, {
      status: 'approved',
      gateway_status: verifiedStatus,
      bonusAmount,
      rolloverRequired,
      creditedAmount: deposit.amount + bonusAmount,
      approved_at: FieldValue.serverTimestamp()
    });
    transaction.update(userRef, {
      balance: newBalance,
      cash_balance: newCashBalance,
      bonus_balance: newBonusBalance,
      rollover_remaining: newRolloverRemaining,
      rollover_target: newRolloverTarget
    });

    const txSnapshot = await db.collection('transactions').where('reference_id', '==', depositRef.id).limit(1).get();
    if (!txSnapshot.empty) {
      transaction.update(txSnapshot.docs[0].ref, {
        status: 'approved',
        balance_after: newBalance,
        completed_at: FieldValue.serverTimestamp()
      });
    }

    if (bonusAmount > 0) {
      transaction.set(db.collection('transactions').doc(), {
        uid: deposit.uid,
        type: 'deposit_bonus',
        amount: bonusAmount,
        status: 'locked',
        reference_id: depositRef.id,
        balance_after: newBalance,
        rollover_required: rolloverRequired,
        created_at: FieldValue.serverTimestamp()
      });
    }

    if (affiliateDoc?.exists) {
      const commission = Math.floor(deposit.amount * (affiliateDoc.data().affiliate_rate ?? 10) / 100);
      transaction.update(affiliateRef, { affiliate_balance: FieldValue.increment(commission) });
      transaction.set(db.collection('affiliate_commissions').doc(), {
        affiliate_id: affiliateDoc.id,
        source_user_id: deposit.uid,
        level: 1,
        amount: commission,
        created_at: FieldValue.serverTimestamp()
      });
      if (upperDoc?.exists) {
        const subCommission = Math.floor(deposit.amount * (upperDoc.data().sub_affiliate_rate ?? 2) / 100);
        transaction.update(upperRef, { affiliate_balance: FieldValue.increment(subCommission) });
        transaction.set(db.collection('affiliate_commissions').doc(), {
          affiliate_id: upperDoc.id,
          source_user_id: deposit.uid,
          level: 2,
          amount: subCommission,
          created_at: FieldValue.serverTimestamp()
        });
      }
    }

    return {
      success: true,
      balance: newBalance,
      cashBalance: newCashBalance,
      bonusBalance: newBonusBalance,
      creditedAmount: deposit.amount + bonusAmount
    };
  });
}

router.post('/webhook/vizzionpay', async (req, res) => {
  try {
    const event = parseVizzionWebhook(req.body);
    console.log('[VizzionPay Webhook Received]:', JSON.stringify(req.body));

    let depositRef = null;
    let depositDoc = null;

    if (event.referenceId) {
      const ref = db.collection('deposit_requests').doc(event.referenceId);
      const doc = await ref.get();
      if (doc.exists) {
        depositRef = ref;
        depositDoc = doc;
      }
    }

    if (!depositDoc && event.gatewayId) {
      const snapshot = await db.collection('deposit_requests').where('gatewayId', '==', String(event.gatewayId)).limit(1).get();
      if (!snapshot.empty) {
        depositRef = snapshot.docs[0].ref;
        depositDoc = snapshot.docs[0];
      }
    }

    if (!depositDoc && req.body?.metadata?.referenceId) {
      const ref = db.collection('deposit_requests').doc(req.body.metadata.referenceId);
      const doc = await ref.get();
      if (doc.exists) {
        depositRef = ref;
        depositDoc = doc;
      }
    }

    if (!depositDoc) {
      console.warn('[VizzionPay Webhook] Depósito não encontrado para payload:', req.body);
      return res.status(200).json({ received: true, warning: 'Deposit not found' });
    }

    const depositData = depositDoc.data();
    if (depositData.status === 'approved') {
      return res.json({ received: true, status: 'already_approved' });
    }

    const isPaid = event.paid ||
      ['COMPLETED', 'PAID', 'APPROVED', 'SETTLED'].includes(String(event.status).toUpperCase()) ||
      ['TRANSACTION_PAID', 'PIX_RECEIVED', 'PAYMENT_RECEIVED'].includes(String(event.event).toUpperCase()) ||
      String(req.body?.status || '').toUpperCase() === 'COMPLETED' ||
      String(req.body?.event || '').toUpperCase() === 'TRANSACTION_PAID';

    if (isPaid) {
      await approveAndCreditDeposit(depositRef, 'COMPLETED');
      console.log(`[VizzionPay Webhook] Depósito ${depositRef.id} aprovado com sucesso e saldo creditado!`);
      return res.json({ received: true, status: 'approved' });
    }

    const statusUpper = String(event.status || req.body?.status || '').toUpperCase();
    if (['REFUNDED', 'CHARGED_BACK', 'FAILED'].includes(statusUpper)) {
      await depositRef.update({
        status: statusUpper.toLowerCase(),
        gateway_status: statusUpper
      });
    }

    res.json({ received: true, status: event.status || 'pending' });
  } catch (error) {
    console.error('Vizzion webhook error:', error);
    res.status(200).json({ received: true, error: error.message });
  }
});

router.get('/check-deposit/:depositId', authenticateToken, async (req, res) => {
  try {
    const depositId = req.params.depositId;
    let depositDoc = null;
    let depositRef = null;

    const directDoc = await db.collection('deposit_requests').doc(depositId).get();
    if (directDoc.exists) {
      depositDoc = directDoc;
      depositRef = directDoc.ref;
    } else {
      const snap = await db.collection('deposit_requests').where('depositId', '==', depositId).limit(1).get();
      if (!snap.empty) {
        depositDoc = snap.docs[0];
        depositRef = snap.docs[0].ref;
      }
    }

    if (!depositDoc) return res.status(404).json({ error: 'Depósito não encontrado.' });
    const deposit = depositDoc.data();
    if (deposit.uid !== req.user.uid) return res.status(403).json({ error: 'Não autorizado.' });

    if (deposit.status === 'approved') {
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      const user = userDoc.data() || {};
      return res.json({
        status: 'approved',
        balance: user.balance || 0,
        cash_balance: user.cash_balance || 0,
        bonus_balance: user.bonus_balance || 0,
        bonusAmount: deposit.bonusAmount || 0,
        amount: deposit.amount
      });
    }

    if (deposit.gatewayId || depositRef.id) {
      try {
        const gatewayTx = await getVizzionTransaction({
          gatewayId: deposit.gatewayId,
          referenceId: depositRef.id
        });
        const gStatus = String(gatewayTx.status || '').toUpperCase();
        if (['COMPLETED', 'PAID', 'APPROVED', 'SETTLED'].includes(gStatus)) {
          const result = await approveAndCreditDeposit(depositRef, 'COMPLETED');
          return res.json({
            status: 'approved',
            balance: result.balance,
            cash_balance: result.cashBalance,
            bonus_balance: result.bonusBalance,
            bonusAmount: deposit.bonusAmount || 0,
            amount: deposit.amount
          });
        }
      } catch (err) {
        console.warn('Vizzion Pay polling lookup info:', err.message);
      }
    }

    res.json({
      status: deposit.status || 'pending',
      amount: deposit.amount
    });
  } catch (error) {
    console.error('Check deposit error:', error);
    res.status(500).json({ error: 'Erro ao verificar depósito.' });
  }
});

router.get('/gateway/status', authenticateToken, (req, res) => {
  res.json({
    provider: vizzionPayStatus.provider,
    configured: vizzionPayStatus.configured,
    webhookConfigured: vizzionPayStatus.webhookConfigured
  });
});

router.post('/withdraw', authenticateToken, async (req, res) => {
  try {
    const { amount, pixKey } = req.body;
    let minWithdrawal = 1000;
    try {
      const settingsDoc = await db.collection('settings').doc('global').get();
      if (settingsDoc.exists) minWithdrawal = settingsDoc.data().minWithdrawal ?? minWithdrawal;
    } catch (e) {}
    if (!amount || amount < minWithdrawal || !pixKey) {
      return res.status(400).json({ error: `Informe uma chave PIX e saque no mínimo R$ ${(minWithdrawal / 100).toFixed(2)}.` });
    }

    const uid = req.user.uid;
    const withdrawalId = uuidv4();

    const result = await db.runTransaction(async (t) => {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error('User not found');
      
      const userData = userDoc.data();
      if (userData.demo_account) throw new Error('Saldo de conta demo é virtual e não pode ser sacado.');
      const wallet = getWalletBuckets(userData);
      if (wallet.rolloverRemaining > 0) {
        throw new Error(`Complete o rollover de R$ ${(wallet.rolloverRemaining / 100).toFixed(2)} em apostas antes de sacar.`);
      }
      if (wallet.cashBalance < amount) throw new Error('Saldo sacável insuficiente.');

      const newBalance = wallet.balance - amount;
      const newCashBalance = wallet.cashBalance - amount;
      t.update(userRef, {
        balance: newBalance,
        cash_balance: newCashBalance
      });

      const reqRef = db.collection('withdrawal_requests').doc();
      t.set(reqRef, {
        uid,
        amount,
        pixKey,
        status: 'pending',
        withdrawalId,
        created_at: FieldValue.serverTimestamp()
      });

      const txRef = db.collection('transactions').doc();
      t.set(txRef, {
        uid,
        type: 'withdraw_request',
        amount: -amount,
        balance_after: newBalance,
        reference_id: reqRef.id,
        created_at: FieldValue.serverTimestamp()
      });

      return { withdrawalId, status: 'pending', balance_after: newBalance };
    });

    res.json(result);
  } catch (error) {
    console.error('Withdraw error:', error);
    res.status(400).json({ error: error.message || 'Internal server error' });
  }
});

router.get('/history', authenticateToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const [snapshot, userDoc, settingsDoc, approvedDepsSnap] = await Promise.all([
      db.collection('transactions').where('uid', '==', uid).get(),
      db.collection('users').doc(uid).get(),
      getPromotionSettings(),
      db.collection('deposit_requests').where('uid', '==', uid).where('status', '==', 'approved').get()
    ]);

    const user = userDoc.exists ? userDoc.data() : {};
    let wallet = getWalletBuckets(user);
    const promotion = normalizePromotionSettings(settingsDoc || {});

    // Sincronização automática do rollover para usuários com depósitos aprovados
    if (!approvedDepsSnap.empty && !user.demo_account) {
      let totalDeposited = 0;
      let totalBonus = 0;
      let totalRolloverTarget = 0;
      const promoEnabled = promotion.promoEnabled !== false;
      const bonusMinDeposit = Number(promotion.bonusMinDeposit) || 2000;
      const bonusPercent = Number(promotion.bonusPercent) || 100;
      const depositMultiplier = promotion.depositRolloverMultiplier != null ? Number(promotion.depositRolloverMultiplier) : 1;
      const bonusMultiplier = promotion.rolloverMultiplier != null ? Number(promotion.rolloverMultiplier) : 10;

      approvedDepsSnap.docs.forEach(doc => {
        const dep = doc.data();
        const depAmount = Number(dep.amount) || 0;
        totalDeposited += depAmount;
        const isEligible = promoEnabled && depAmount >= bonusMinDeposit;
        const bAmount = dep.bonusAmount != null && Number(dep.bonusAmount) > 0
          ? Number(dep.bonusAmount)
          : (isEligible ? Math.floor(depAmount * bonusPercent / 100) : 0);
        totalBonus += bAmount;
        const depRollover = Math.ceil(depAmount * depositMultiplier);
        const bonRollover = Math.ceil(bAmount * bonusMultiplier);
        totalRolloverTarget += (depRollover + bonRollover);
      });

      if (user.rollover_target == null || user.rollover_target === 0 || (user.rollover_remaining === 0 && (user.balance || 0) > 0 && !user.rollover_completed_at)) {
        const betsSnap = await db.collection('bets').where('uid', '==', uid).where('status', '==', 'completed').get();
        const totalWagered = betsSnap.docs.reduce((sum, b) => sum + (Number(b.data().amount) || 0), 0);
        const rolloverRemaining = Math.max(0, totalRolloverTarget - totalWagered);
        const balance = Math.round(Number(user.balance) || 0);

        let bonusBalance = 0;
        let cashBalance = balance;
        if (rolloverRemaining > 0 && balance > 0) {
          bonusBalance = Math.min(balance, totalBonus);
          cashBalance = balance - bonusBalance;
        }

        if (rolloverRemaining !== user.rollover_remaining || totalRolloverTarget !== user.rollover_target) {
          try {
            await userDoc.ref.update({
              rollover_remaining: rolloverRemaining,
              rollover_target: totalRolloverTarget,
              cash_balance: cashBalance,
              bonus_balance: bonusBalance
            });
          } catch (e) {}
          wallet.rolloverRemaining = rolloverRemaining;
          wallet.rolloverTarget = totalRolloverTarget;
          wallet.cashBalance = cashBalance;
          wallet.bonusBalance = bonusBalance;
        }
      }
    }

    const history = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aTime = a.created_at?.toMillis?.() || new Date(a.created_at || 0).getTime();
        const bTime = b.created_at?.toMillis?.() || new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 50);
    const progress = wallet.rolloverTarget > 0
      ? Math.max(0, Math.min(100, Math.round((1 - wallet.rolloverRemaining / wallet.rolloverTarget) * 100)))
      : 100;
    res.json({
      transactions: history,
      balance: wallet.balance,
      cashBalance: wallet.cashBalance,
      bonusBalance: wallet.bonusBalance,
      rolloverRemaining: wallet.rolloverRemaining,
      rolloverTarget: wallet.rolloverTarget,
      rolloverProgress: progress,
      withdrawalsLocked: wallet.rolloverRemaining > 0,
      promotion
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
