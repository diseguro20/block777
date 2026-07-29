import express from 'express';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
    
    const userData = userDoc.data();
    const ref_code = userData.ref_code;
    
    const level1Query = await db.collection('users').where('referred_by', '==', uid).get();
    const level1Count = level1Query.size;
    
    const level2Query = await db.collection('users').where('sub_referred_by', '==', uid).get();
    const level2Count = level2Query.size;
    
    const totalReferred = level1Count + level2Count;
    
    const commsQuery = await db.collection('affiliate_commissions').where('affiliate_id', '==', uid).get();
    let totalCommissions = 0;
    commsQuery.forEach(doc => {
      totalCommissions += doc.data().amount || 0;
    });

    const host = req.headers.host;
    const protocol = req.protocol || 'https';
    const referralLink = `${protocol}://${host}?ref=${ref_code}`;

    const commissions = commsQuery.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aTime = a.created_at?.toMillis?.() || 0;
        const bTime = b.created_at?.toMillis?.() || 0;
        return bTime - aTime;
      })
      .slice(0, 20);

    res.json({
      ref_code,
      referralLink,
      totalReferred,
      level1Count,
      level2Count,
      totalCommissions,
      affiliateBalance: userData.affiliate_balance || 0,
      rates: {
        level1: userData.affiliate_rate ?? 10,
        level2: userData.sub_affiliate_rate ?? 2
      },
      commissions
    });
  } catch (error) {
    console.error('Affiliate stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/redeem', authenticateToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    
    const result = await db.runTransaction(async (t) => {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error('User not found');
      
      const userData = userDoc.data();
      const affiliateBal = userData.affiliate_balance || 0;
      
      if (affiliateBal <= 0) throw new Error('No affiliate balance to redeem');
      
      const newMainBalance = (userData.balance || 0) + affiliateBal;
      
      t.update(userRef, {
        balance: FieldValue.increment(affiliateBal),
        affiliate_balance: 0
      });
      
      const txRef = db.collection('transactions').doc();
      t.set(txRef, {
        uid,
        type: 'affiliate_redeem',
        amount: affiliateBal,
        balance_after: newMainBalance,
        created_at: FieldValue.serverTimestamp()
      });
      
      return { redeemed: affiliateBal, newBalance: newMainBalance };
    });
    
    res.json(result);
  } catch (error) {
    console.error('Affiliate redeem error:', error);
    res.status(400).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
