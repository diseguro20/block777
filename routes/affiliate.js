import express from 'express';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { DEFAULT_TENANT_ID, belongsToTenant } from '../lib/tenant.js';

const router = express.Router();

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const tenantId = req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || !belongsToTenant(userDoc.data(), tenantId)) return res.status(404).json({ error: 'User not found' });
    
    const userData = userDoc.data();
    const ref_code = userData.ref_code;
    
    const level1Query = await db.collection('users').where('referred_by', '==', uid).get();
    const level1Docs = level1Query.docs.filter(doc => belongsToTenant(doc.data(), tenantId));
    const level1Count = level1Docs.length;
    
    const level2Query = await db.collection('users').where('sub_referred_by', '==', uid).get();
    const level2Docs = level2Query.docs.filter(doc => belongsToTenant(doc.data(), tenantId));
    const level2Count = level2Docs.length;
    
    const totalReferred = level1Count + level2Count;
    
    const commsQuery = await db.collection('affiliate_commissions').where('affiliate_id', '==', uid).get();
    let totalCommissions = 0;
    commsQuery.forEach(doc => {
      if (belongsToTenant(doc.data(), tenantId)) totalCommissions += doc.data().amount || 0;
    });

    const host = req.headers.host;
    const protocol = req.protocol || 'https';
    const tenantQuery = tenantId === DEFAULT_TENANT_ID ? '' : `tenant=${encodeURIComponent(tenantId)}&`;
    const referralLink = `${protocol}://${host}?${tenantQuery}ref=${encodeURIComponent(ref_code || '')}`;

    const commissions = commsQuery.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => belongsToTenant(item, tenantId))
      .sort((a, b) => {
        const aTime = a.created_at?.toMillis?.() || 0;
        const bTime = b.created_at?.toMillis?.() || 0;
        return bTime - aTime;
      })
      .slice(0, 20);

    const allReferredDocs = [...level1Docs, ...level2Docs];

    let totalDeposited = 0;
    const leads = await Promise.all(allReferredDocs.map(async doc => {
      const d = doc.data();
      const isLevel1 = d.referred_by === uid;
      const depSnap = await db.collection('deposit_requests').where('uid', '==', doc.id).get();
      const approved = depSnap.docs.map(x => x.data()).filter(x => x.status === 'approved' && belongsToTenant(x, tenantId));
      const leadDeposited = approved.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      totalDeposited += leadDeposited;

      return {
        id: doc.id,
        username: d.username,
        email: d.email,
        phone: d.phone || null,
        level: isLevel1 ? 1 : 2,
        totalDeposited: leadDeposited,
        created_at: d.created_at
      };
    }));

    leads.sort((a, b) => (b.totalDeposited || 0) - (a.totalDeposited || 0));

    res.json({
      ref_code,
      referralLink,
      totalReferred,
      level1Count,
      level2Count,
      totalCommissions,
      totalDeposited,
      affiliateBalance: userData.affiliate_balance || 0,
      rates: {
        level1: userData.affiliate_rate ?? 10,
        level2: userData.sub_affiliate_rate ?? 2
      },
      commissions,
      leads: leads.slice(0, 50)
    });
  } catch (error) {
    console.error('Affiliate stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/redeem', authenticateToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const tenantId = req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID;
    
    const result = await db.runTransaction(async (t) => {
      const userRef = db.collection('users').doc(uid);
      const userDoc = await t.get(userRef);
      if (!userDoc.exists || !belongsToTenant(userDoc.data(), tenantId)) throw new Error('User not found');
      
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
        tenant_id: tenantId,
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
