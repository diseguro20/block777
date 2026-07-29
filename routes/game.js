import express from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const uid = req.user.uid;
    const userRef = db.collection('users').doc(uid);

    // Consulta de configurações e apostas pendentes antes da transação para evitar conflitos no Firestore
    let difficulty = 'balanced';
    let minBet = 100;
    let maxBet = 10000;
    let maintenance = false;
    try {
      const settingsDoc = await db.collection('settings').doc('global').get();
      if (settingsDoc.exists) {
        const settings = settingsDoc.data();
        difficulty = settings.difficulty || 'balanced';
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
      if (userData.balance < amount) throw new Error('Saldo insuficiente para realizar a aposta.');

      if (userData.is_influencer === 1) {
        difficulty = 'easy';
      }

      // Marcar apostas anteriores pendentes como encerradas
      pendingBets.docs.forEach(betDoc => {
        t.update(betDoc.ref, { status: 'completed', payout: 0, completed_at: FieldValue.serverTimestamp() });
      });

      t.update(userRef, { balance: FieldValue.increment(-amount) });
      const newBalance = userData.balance - amount;

      const betRef = db.collection('bets').doc();
      t.set(betRef, {
        uid,
        amount,
        sessionId,
        seedHash,
        difficulty,
        status: 'pending',
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

      return { sessionId, seed: seedHash, difficulty, balance_after: newBalance };
    });

    res.json(result);
  } catch (error) {
    console.error('Game start error:', error);
    res.status(400).json({ error: error.message || 'Erro ao iniciar partida' });
  }
});

router.post('/end', authenticateToken, async (req, res) => {
  try {
    const { sessionId, floorsReached, multiplier } = req.body;
    if (!sessionId || multiplier == null) {
      return res.status(400).json({ error: 'Dados da partida incompletos' });
    }

    const uid = req.user.uid;
    const finalMultiplier = Math.min(Number(multiplier), 10);

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
    const userRef = db.collection('users').doc(uid);

    const result = await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error('Usuário não encontrado');

      let newBalance = userDoc.data().balance;

      t.update(betDoc.ref, {
        status: 'completed',
        floorsReached: floorsReached || 0,
        multiplier: finalMultiplier,
        payout,
        completed_at: FieldValue.serverTimestamp()
      });

      if (payout > 0) {
        t.update(userRef, { balance: FieldValue.increment(payout) });
        newBalance += payout;

        const txRef = db.collection('transactions').doc();
        t.set(txRef, {
          uid,
          type: 'win',
          amount: payout,
          balance_after: newBalance,
          reference_id: betDoc.id,
          created_at: FieldValue.serverTimestamp()
        });
      }

      return { payout, balance_after: newBalance, multiplier: finalMultiplier };
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
