import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { createVizzionPix, parseVizzionWebhook, verifyVizzionWebhook, vizzionPayStatus } from '../lib/vizzionpay.js';

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
    const docRef = db.collection('deposit_requests').doc();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const user = userDoc.exists ? userDoc.data() : {};
    const webhookUrl = `${req.protocol}://${req.get('host')}/api/wallet/webhook/vizzionpay`;
    const charge = await createVizzionPix({
      amount,
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
      expires_at: charge.expiresAt || null,
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
      status: 'pending'
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Não foi possível gerar o PIX.' });
  }
});

router.post('/webhook/vizzionpay', async (req, res) => {
  try {
    if (!verifyVizzionWebhook(req.headers, req.body)) {
      return res.status(401).json({ error: 'Assinatura do webhook inválida.' });
    }
    const event = parseVizzionWebhook(req.body);
    if (!event.gatewayId) return res.status(400).json({ error: 'Transação não identificada.' });
    if (!event.paid) return res.json({ received: true, status: event.status });

    const depositSnapshot = await db.collection('deposit_requests').where('gatewayId', '==', event.gatewayId).limit(1).get();
    if (depositSnapshot.empty) return res.status(404).json({ error: 'Depósito não encontrado.' });
    const depositRef = depositSnapshot.docs[0].ref;
    const txSnapshot = await db.collection('transactions').where('reference_id', '==', depositRef.id).limit(1).get();

    await db.runTransaction(async transaction => {
      const depositDoc = await transaction.get(depositRef);
      if (!depositDoc.exists) throw new Error('Depósito não encontrado.');
      const deposit = depositDoc.data();
      if (deposit.status === 'approved') return;
      if (deposit.status !== 'pending') throw new Error('Depósito não está pendente.');

      const userRef = db.collection('users').doc(deposit.uid);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error('Usuário não encontrado.');
      const user = userDoc.data();

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
        gateway_status: event.status,
        approved_at: FieldValue.serverTimestamp()
      });
      transaction.update(userRef, { balance: FieldValue.increment(deposit.amount) });
      if (!txSnapshot.empty) {
        transaction.update(txSnapshot.docs[0].ref, {
          status: 'approved',
          balance_after: (user.balance || 0) + deposit.amount,
          completed_at: FieldValue.serverTimestamp()
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
    });
    res.json({ received: true });
  } catch (error) {
    console.error('Vizzion webhook error:', error);
    res.status(400).json({ error: error.message || 'Webhook inválido.' });
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
