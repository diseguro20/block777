import express from 'express';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/stats', async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const totalUsers = usersSnapshot.size;

    const betsSnapshot = await db.collection('bets').get();
    let totalBets = 0;
    let totalPayouts = 0;
    betsSnapshot.forEach(doc => {
      const data = doc.data();
      totalBets += data.amount || 0;
      totalPayouts += data.payout || 0;
    });
    
    const houseProfit = totalBets - totalPayouts;

    const depositsSnapshot = await db.collection('deposit_requests').where('status', '==', 'pending').get();
    const pendingDeposits = depositsSnapshot.size;

    const withdrawalsSnapshot = await db.collection('withdrawal_requests').where('status', '==', 'pending').get();
    const pendingWithdrawals = withdrawalsSnapshot.size;

    res.json({ totalUsers, totalBets, totalPayouts, houseProfit, pendingDeposits, pendingWithdrawals });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const search = req.query.search?.toLowerCase();
    const snapshot = await db.collection('users').get();
    
    let users = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      delete data.password_hash;
      users.push({ id: doc.id, ...data });
    });

    if (search) {
      users = users.filter(u => 
        (u.username && u.username.toLowerCase().includes(search)) || 
        (u.email && u.email.toLowerCase().includes(search))
      );
    }

    res.json(users);
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { role, status, is_influencer } = req.body;
    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (is_influencer !== undefined) updateData.is_influencer = is_influencer;

    await db.collection('users').doc(req.params.id).update(updateData);
    
    const updated = await db.collection('users').doc(req.params.id).get();
    const userData = updated.data();
    delete userData.password_hash;
    
    res.json({ id: updated.id, ...userData });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/users/:id/balance', async (req, res) => {
  try {
    const { amount, type, description } = req.body;
    if (!amount || !type) return res.status(400).json({ error: 'Amount and type are required' });

    const uid = req.params.id;
    const numAmount = Number(amount);
    const adjustment = type === 'credit' ? numAmount : -numAmount;

    const result = await db.runTransaction(async (t) => {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error('User not found');
      
      const newBalance = (userDoc.data().balance || 0) + adjustment;
      if (newBalance < 0) throw new Error('Resulting balance would be negative');

      t.update(userRef, { balance: FieldValue.increment(adjustment) });

      const txRef = db.collection('transactions').doc();
      t.set(txRef, {
        uid,
        type: 'admin_adjustment',
        amount: adjustment,
        balance_after: newBalance,
        description: description || '',
        created_at: FieldValue.serverTimestamp()
      });

      return { newBalance };
    });

    res.json(result);
  } catch (error) {
    console.error('Admin adjust balance error:', error);
    res.status(400).json({ error: error.message || 'Internal server error' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await db.collection('users').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const doc = await db.collection('settings').doc('global').get();
    if (!doc.exists) {
      await db.collection('settings').doc('global').set({ difficulty: 'balanced' });
      return res.json({ difficulty: 'balanced' });
    }
    res.json(doc.data());
  } catch (error) {
    console.error('Admin settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/settings/difficulty', async (req, res) => {
  try {
    const { difficulty } = req.body;
    if (!['easy', 'balanced', 'strict'].includes(difficulty)) {
      return res.status(400).json({ error: 'Invalid difficulty' });
    }
    await db.collection('settings').doc('global').set({ difficulty }, { merge: true });
    res.json({ difficulty });
  } catch (error) {
    console.error('Admin settings update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/deposits', async (req, res) => {
  try {
    const snapshot = await db.collection('deposit_requests').where('status', '==', 'pending').get();
    const deposits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(deposits);
  } catch (error) {
    console.error('Admin deposits list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/deposits/:id/approve', async (req, res) => {
  try {
    const depositId = req.params.id;
    
    const result = await db.runTransaction(async (t) => {
      const depRef = db.collection('deposit_requests').doc(depositId);
      const depDoc = await t.get(depRef);
      if (!depDoc.exists) throw new Error('Deposit not found');
      
      const depData = depDoc.data();
      if (depData.status !== 'pending') throw new Error('Deposit already processed');
      
      const uid = depData.uid;
      const amount = depData.amount;
      
      const userRef = db.collection('users').doc(uid);
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error('User not found');
      
      const userData = userDoc.data();
      const newBalance = (userData.balance || 0) + amount;
      
      t.update(depRef, { status: 'approved', processed_at: FieldValue.serverTimestamp() });
      t.update(userRef, { balance: FieldValue.increment(amount) });
      
      const txRef = db.collection('transactions').doc();
      t.set(txRef, {
        uid,
        type: 'deposit',
        amount: amount,
        balance_after: newBalance,
        reference_id: depositId,
        created_at: FieldValue.serverTimestamp()
      });

      // Affiliate commissions
      if (userData.referred_by) {
        const referrerId = userData.referred_by;
        const referrerRef = db.collection('users').doc(referrerId);
        const referrerDoc = await t.get(referrerRef);
        
        if (referrerDoc.exists) {
          const rData = referrerDoc.data();
          const rate = rData.affiliate_rate || 0.10;
          const commission = Math.floor(amount * rate);
          
          if (commission > 0) {
            t.update(referrerRef, { affiliate_balance: FieldValue.increment(commission) });
            
            const commRef = db.collection('affiliate_commissions').doc();
            t.set(commRef, {
              affiliate_id: referrerId,
              from_uid: uid,
              amount: commission,
              level: 1,
              deposit_id: depositId,
              created_at: FieldValue.serverTimestamp()
            });
          }
          
          if (rData.referred_by) {
            const subReferrerId = rData.referred_by;
            const subReferrerRef = db.collection('users').doc(subReferrerId);
            const subReferrerDoc = await t.get(subReferrerRef);
            
            if (subReferrerDoc.exists) {
              const srData = subReferrerDoc.data();
              const subRate = srData.sub_affiliate_rate || 0.02;
              const subCommission = Math.floor(amount * subRate);
              
              if (subCommission > 0) {
                t.update(subReferrerRef, { affiliate_balance: FieldValue.increment(subCommission) });
                
                const subCommRef = db.collection('affiliate_commissions').doc();
                t.set(subCommRef, {
                  affiliate_id: subReferrerId,
                  from_uid: uid,
                  amount: subCommission,
                  level: 2,
                  deposit_id: depositId,
                  created_at: FieldValue.serverTimestamp()
                });
              }
            }
          }
        }
      }

      return { success: true };
    });
    
    res.json(result);
  } catch (error) {
    console.error('Admin deposit approve error:', error);
    res.status(400).json({ error: error.message || 'Internal server error' });
  }
});

router.put('/deposits/:id/reject', async (req, res) => {
  try {
    await db.collection('deposit_requests').doc(req.params.id).update({
      status: 'rejected',
      processed_at: FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Admin deposit reject error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/withdrawals', async (req, res) => {
  try {
    const snapshot = await db.collection('withdrawal_requests').where('status', '==', 'pending').get();
    const withdrawals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(withdrawals);
  } catch (error) {
    console.error('Admin withdrawals list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/withdrawals/:id/approve', async (req, res) => {
  try {
    await db.collection('withdrawal_requests').doc(req.params.id).update({
      status: 'approved',
      processed_at: FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Admin withdrawal approve error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/withdrawals/:id/reject', async (req, res) => {
  try {
    const withId = req.params.id;
    
    const result = await db.runTransaction(async (t) => {
      const withRef = db.collection('withdrawal_requests').doc(withId);
      const withDoc = await t.get(withRef);
      if (!withDoc.exists) throw new Error('Withdrawal not found');
      
      const withData = withDoc.data();
      if (withData.status !== 'pending') throw new Error('Withdrawal already processed');
      
      const uid = withData.uid;
      const amount = withData.amount;
      
      const userRef = db.collection('users').doc(uid);
      const userDoc = await t.get(userRef);
      
      if (userDoc.exists) {
        const newBalance = (userDoc.data().balance || 0) + amount;
        t.update(userRef, { balance: FieldValue.increment(amount) });
        
        const txRef = db.collection('transactions').doc();
        t.set(txRef, {
          uid,
          type: 'withdrawal_refund',
          amount: amount,
          balance_after: newBalance,
          reference_id: withId,
          created_at: FieldValue.serverTimestamp()
        });
      }
      
      t.update(withRef, { status: 'rejected', processed_at: FieldValue.serverTimestamp() });
      
      return { success: true };
    });
    
    res.json(result);
  } catch (error) {
    console.error('Admin withdrawal reject error:', error);
    res.status(400).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
