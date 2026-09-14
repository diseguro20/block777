import express from 'express';
import { db } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { DEFAULT_TENANT_ID, belongsToTenant } from '../lib/tenant.js';
import { pushStatus, removePushSubscription, savePushSubscription, sendAffiliateTestNotification } from '../lib/pushNotifications.js';
import { buildAffiliateNetwork } from '../lib/affiliateReporting.js';

const router = express.Router();

router.get('/notifications/config', authenticateToken, async (req, res) => {
  const tenantId = req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID;
  const snapshot = await db.collection('push_subscriptions').where('affiliate_id', '==', req.user.uid).get();
  const active = snapshot.docs.some(doc => doc.data().active !== false && belongsToTenant(doc.data(), tenantId));
  res.json({ configured: pushStatus.configured, publicKey: pushStatus.publicKey, active });
});

router.post('/notifications/subscribe', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID;
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists || !belongsToTenant(userDoc.data(), tenantId) || !userDoc.data().ref_code) {
      return res.status(403).json({ error: 'Conta de afiliado inválida.' });
    }
    await savePushSubscription({
      uid: req.user.uid,
      tenantId,
      subscription: req.body?.subscription,
      userAgent: req.headers['user-agent'] || ''
    });
    res.json({ success: true, active: true });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível ativar as notificações.' });
  }
});

router.post('/notifications/unsubscribe', authenticateToken, async (req, res) => {
  await removePushSubscription({ uid: req.user.uid, endpoint: req.body?.endpoint });
  res.json({ success: true, active: false });
});

router.post('/notifications/test', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID;
    const result = await sendAffiliateTestNotification({ affiliateId: req.user.uid, tenantId });
    if (!result.subscriptions) return res.status(409).json({ error: 'Este celular ainda não está inscrito.' });
    if (!result.sent) return res.status(502).json({ error: 'O serviço do celular recusou o teste. Reative as notificações.' });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível enviar a notificação de teste.' });
  }
});

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const uid = req.user.uid;
    const tenantId = req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || !belongsToTenant(userDoc.data(), tenantId)) return res.status(404).json({ error: 'User not found' });
    
    const userData = userDoc.data();
    const ref_code = userData.ref_code;
    
    const [usersQuery, approvedDepositsQuery, commsQuery, payoutsQuery] = await Promise.all([
      db.collection('users').get(),
      db.collection('deposit_requests').where('status', '==', 'approved').get(),
      db.collection('affiliate_commissions').where('affiliate_id', '==', uid).get(),
      db.collection('affiliate_payouts').where('affiliate_id', '==', uid).get()
    ]);
    const tenantUsers = usersQuery.docs.filter(doc => belongsToTenant(doc.data(), tenantId)).map(doc => ({ id: doc.id, ...doc.data() }));
    const approvedDeposits = approvedDepositsQuery.docs.filter(doc => belongsToTenant(doc.data(), tenantId)).map(doc => ({ id: doc.id, ...doc.data() }));
    const network = buildAffiliateNetwork({ affiliateId: uid, users: tenantUsers, deposits: approvedDeposits });
    const { level1Count, level2Count, totalReferred, totalDeposited, leads } = network;

    let totalCommissions = 0;
    commsQuery.forEach(doc => {
      if (belongsToTenant(doc.data(), tenantId)) totalCommissions += doc.data().amount || 0;
    });

    const host = req.headers.host;
    const protocol = req.protocol || 'https';
    const tenantQuery = tenantId === DEFAULT_TENANT_ID ? '' : `tenant=${encodeURIComponent(tenantId)}&`;
    const referralLink = `${protocol}://${host}/r?${tenantQuery}ref=${encodeURIComponent(ref_code || '')}`;

    const commissions = commsQuery.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => belongsToTenant(item, tenantId))
      .sort((a, b) => {
        const aTime = a.created_at?.toMillis?.() || 0;
        const bTime = b.created_at?.toMillis?.() || 0;
        return bTime - aTime;
      })
      .slice(0, 20);

    const payouts = payoutsQuery.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => item.status === 'paid' && belongsToTenant(item, tenantId))
      .sort((a, b) => {
        const aTime = a.paid_at?.toMillis?.() || a.created_at?.toMillis?.() || 0;
        const bTime = b.paid_at?.toMillis?.() || b.created_at?.toMillis?.() || 0;
        return bTime - aTime;
      });
    const totalPaid = payouts.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    totalCommissions += payouts.reduce((sum, item) => sum + (Number(item.adjustment_amount) || 0), 0);

    res.json({
      ref_code,
      referralLink,
      totalReferred,
      level1Count,
      level2Count,
      totalCommissions,
      totalDeposited,
      affiliateBalance: userData.affiliate_balance || 0,
      totalPaid,
      rates: {
        level1: userData.affiliate_rate ?? 10,
        level2: userData.sub_affiliate_rate ?? 2
      },
      commissions,
      payouts: payouts.slice(0, 20),
      leads: leads.slice(0, 50)
    });
  } catch (error) {
    console.error('Affiliate stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/redeem', authenticateToken, (_req, res) => {
  res.status(409).json({ error: 'As comissões são pagas via PIX e confirmadas pelo administrador.' });
});

export default router;
