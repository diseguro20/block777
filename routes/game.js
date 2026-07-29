import express from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { allocatePromotionalBet, allocatePromotionalPayout, getWalletBuckets } from '../lib/promotion.js';

const router = express.Router();

router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const uid = req.user.uid;
    const userRef = db.collection('users').doc(uid);

    // Consulta de configurações e apostas pendentes antes da transação para evitar conflitos no Firestore
    let difficulty = 'impossible';
    let minBet = 100;
    let maxBet = 10000;
    let maintenance = false;
    try {
      const settingsDoc = await db.collection('settings').doc('global').get();
      if (settingsDoc.exists) {
        const settings = settingsDoc.data();
        difficulty = settings.difficulty || 'impossible';
        minBet = settings.minBet ?? minBet;
        maxBet = settings.maxBet ?? maxBet;
        maintenance = Boolean(settings.maintenance);
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
      const wallet = getWalletBuckets(userData);
      if (wallet.balance < amount) throw new Error('Saldo insuficiente para realizar a aposta.');

      if (userData.is_influencer === 1) {
        difficulty = 'easy';
      } else {
        // Jogador normal: SEMPRE impossível
        difficulty = 'impossible';
      }

      // Marcar apostas anteriores pendentes como encerradas
      pendingBets.docs.forEach(betDoc => {
        t.update(betDoc.ref, {
          status: 'completed',
          result: 'loss',
          payout: 0,
          multiplier: 0,
          blocksPlaced: 0,
          linesCleared: 0,
          completed_at: FieldValue.serverTimestamp()
        });
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
        rolloverCompleted,
        created_at: FieldValue.serverTimestamp()
      });

      const txRef = db.collection('transactions').doc();
      t.set(txRef, {
        uid,
        type: 'bet',
        amount: -amount,
        balance_after: newBalance,
        reference_id: betRef.id,
        created_at: FieldValue.serverTimestamp()
      });
      if (rolloverCompleted) {
        t.set(db.collection('transactions').doc(), {
          uid,
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

router.post('/end', authenticateToken, async (req, res) => {
  try {
    const { sessionId, floorsReached, multiplier, blocksPlaced, score } = req.body;
    if (!sessionId || multiplier == null) {
      return res.status(400).json({ error: 'Dados da partida incompletos' });
    }

    const uid = req.user.uid;
    const finalMultiplier = Math.max(0, Math.min(Number(multiplier) || 0, 10));

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
    const payout = Math.floor(betData.amount * finalMultiplier);
    const safeLines = Math.max(0, Math.floor(Number(floorsReached) || 0));
    const safeBlocks = Math.max(0, Math.floor(Number(blocksPlaced) || 0));
    const safeScore = Math.max(0, Math.floor(Number(score) || 0));
    const resultLabel = payout > 0 ? 'win' : 'loss';
    const userRef = db.collection('users').doc(uid);

    const result = await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error('Usuário não encontrado');

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
        payout,
        completed_at: FieldValue.serverTimestamp()
      });

      if (payout > 0) {
        const payoutAllocation = allocatePromotionalPayout(wallet, payout, betData);
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
