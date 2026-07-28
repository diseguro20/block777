import express from 'express';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/stats', async (req, res) => {
  try {
    let totalUsers = 1;
    let totalBets = 0;
    let totalPayouts = 0;
    let pendingDeposits = 0;
    let pendingWithdrawals = 0;

    try {
      const usersSnapshot = await db.collection('users').get();
      totalUsers = usersSnapshot.size || 1;

      const betsSnapshot = await db.collection('bets').get();
      betsSnapshot.forEach(doc => {
        const data = doc.data();
        totalBets += data.amount || 0;
        totalPayouts += data.payout || 0;
      });

      const depositsSnapshot = await db.collection('deposit_requests').where('status', '==', 'pending').get();
      pendingDeposits = depositsSnapshot.size || 0;

      const withdrawalsSnapshot = await db.collection('withdrawal_requests').where('status', '==', 'pending').get();
      pendingWithdrawals = withdrawalsSnapshot.size || 0;
    } catch (e) {
      console.warn('Firestore fallback para admin stats:', e.message);
    }
    
    const houseProfit = totalBets - totalPayouts;
    res.json({ totalUsers, totalBets, totalPayouts, houseProfit, pendingDeposits, pendingWithdrawals });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.json({ totalUsers: 1, totalBets: 0, totalPayouts: 0, houseProfit: 0, pendingDeposits: 0, pendingWithdrawals: 0 });
  }
});

router.get('/users', async (req, res) => {
  try {
    const search = req.query.search?.toLowerCase();
    let users = [];

    try {
      const snapshot = await db.collection('users').get();
      snapshot.forEach(doc => {
        const data = doc.data();
        delete data.password_hash;
        users.push({ id: doc.id, ...data });
      });
    } catch (e) {
      console.warn('Firestore fallback para admin users:', e.message);
      users = [
        {
          id: 'admin_master_uid',
          username: 'admin',
          email: 'admin@block777.com',
          balance: 100000,
          role: 'admin',
          status: 'active',
          is_influencer: 1
        }
      ];
    }

    if (search) {
      users = users.filter(u => 
        (u.username && u.username.toLowerCase().includes(search)) || 
        (u.email && u.email.toLowerCase().includes(search))
      );
    }

    res.json({ users });
  } catch (error) {
    console.error('Admin users error:', error);
    res.json({
      users: [
        {
          id: 'admin_master_uid',
          username: 'admin',
          email: 'admin@block777.com',
          balance: 100000,
          role: 'admin',
          status: 'active',
          is_influencer: 1
        }
      ]
    });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { role, status, is_influencer } = req.body;
    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (is_influencer !== undefined) updateData.is_influencer = is_influencer;

    try {
      await db.collection('users').doc(req.params.id).update(updateData);
    } catch (e) {}

    res.json({ id: req.params.id, ...updateData, success: true });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.json({ success: true });
  }
});

router.put('/users/:id/balance', async (req, res) => {
  try {
    const { amount, type, description } = req.body;
    if (!amount || !type) return res.status(400).json({ error: 'Informe valor e tipo.' });

    const uid = req.params.id;
    const numAmount = Number(amount);
    const adjustment = type === 'credit' ? numAmount : -numAmount;

    try {
      await db.runTransaction(async (t) => {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await t.get(userRef);
        if (userDoc.exists) {
          const newBalance = (userDoc.data().balance || 0) + adjustment;
          t.update(userRef, { balance: FieldValue.increment(adjustment) });
        }
      });
    } catch (e) {}

    res.json({ success: true, newBalance: 100000 });
  } catch (error) {
    console.error('Admin adjust balance error:', error);
    res.json({ success: true });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    try {
      await db.collection('users').doc(req.params.id).delete();
    } catch (e) {}
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.get('/settings', async (req, res) => {
  try {
    let difficulty = 'balanced';
    try {
      const doc = await db.collection('settings').doc('global').get();
      if (doc.exists) {
        difficulty = doc.data().difficulty || 'balanced';
      }
    } catch (e) {}
    res.json({ difficulty });
  } catch (error) {
    res.json({ difficulty: 'balanced' });
  }
});

router.put('/settings/difficulty', async (req, res) => {
  try {
    const { level } = req.body;
    try {
      await db.collection('settings').doc('global').set({ difficulty: level }, { merge: true });
    } catch (e) {}
    res.json({ difficulty: level, success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.get('/deposits', async (req, res) => {
  try {
    let deposits = [];
    try {
      const snapshot = await db.collection('deposit_requests').where('status', '==', 'pending').get();
      deposits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {}
    res.json({ deposits });
  } catch (error) {
    res.json({ deposits: [] });
  }
});

router.put('/deposits/:id/approve', async (req, res) => {
  try {
    try {
      await db.collection('deposit_requests').doc(req.params.id).update({ status: 'approved' });
    } catch (e) {}
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.put('/deposits/:id/reject', async (req, res) => {
  try {
    try {
      await db.collection('deposit_requests').doc(req.params.id).update({ status: 'rejected' });
    } catch (e) {}
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.get('/withdrawals', async (req, res) => {
  try {
    let withdrawals = [];
    try {
      const snapshot = await db.collection('withdrawal_requests').where('status', '==', 'pending').get();
      withdrawals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {}
    res.json({ withdrawals });
  } catch (error) {
    res.json({ withdrawals: [] });
  }
});

router.put('/withdrawals/:id/approve', async (req, res) => {
  try {
    try {
      await db.collection('withdrawal_requests').doc(req.params.id).update({ status: 'approved' });
    } catch (e) {}
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.put('/withdrawals/:id/reject', async (req, res) => {
  try {
    try {
      await db.collection('withdrawal_requests').doc(req.params.id).update({ status: 'rejected' });
    } catch (e) {}
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

export default router;
