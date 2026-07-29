import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/deposit', authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    let minDeposit = 500;
    try {
      const settingsDoc = await db.collection('settings').doc('global').get();
      if (settingsDoc.exists) minDeposit = settingsDoc.data().minDeposit ?? minDeposit;
    } catch (e) {}
    if (!amount || amount < minDeposit || amount > 100000) {
      return res.status(400).json({ error: `O depósito deve ficar entre R$ ${(minDeposit / 100).toFixed(2)} e R$ 1.000,00.` });
    }

    const depositId = uuidv4();
    const pixCode = `00020101021226580014BR.GOV.BCB.PIX0136${uuidv4()}5204000053039865404${(amount/100).toFixed(2)}5802BR5913Blockerino PIX6008BRASILIA62070503***6304ABCD`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(pixCode)}`;

    const docRef = db.collection('deposit_requests').doc();
    await docRef.set({
      uid: req.user.uid,
      amount,
      pixCode,
      qrCodeUrl,
      status: 'pending',
      depositId,
      created_at: FieldValue.serverTimestamp()
    });

    res.json({ depositId, pixCode, qrCodeUrl });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
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
      if (userData.balance < amount) throw new Error('Insufficient balance');

      t.update(userRef, { balance: FieldValue.increment(-amount) });
      const newBalance = userData.balance - amount;

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

      return { withdrawalId, status: 'pending' };
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
    const snapshot = await db.collection('transactions')
      .where('uid', '==', uid)
      .get();

    const history = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aTime = a.created_at?.toMillis?.() || new Date(a.created_at || 0).getTime();
        const bTime = b.created_at?.toMillis?.() || new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 50);
    res.json({ transactions: history });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
