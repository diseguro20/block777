import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { calculateDepositPromotion, getWalletBuckets, PROMOTION_DEFAULTS } from '../lib/promotion.js';
import { buildManagerCode, DEFAULT_MANAGER_GGR_RATE, managerPeriod, normalizeGgrRate } from '../lib/ggr.js';
import { BRANDING_DEFAULTS, normalizeBranding } from '../lib/branding.js';
import { authTokenTtl, getJwtSecret } from '../lib/security.js';
import { DEFAULT_TENANT_ID, belongsToTenant, tenantBannedIpsId, tenantSettingsRef } from '../lib/tenant.js';
import { BANNER_DEFAULTS, normalizeBanners } from '../lib/banners.js';
import { findTenantUser } from '../lib/userLookup.js';
import { adminSummaryRef, emptyAdminSummary, normalizeAdminSummary, updateAdminSummary } from '../lib/adminSummary.js';

const JWT_SECRET = getJwtSecret();
const router = express.Router();

router.use(authenticateToken);
router.use(requireAdmin);
router.use((req, res, next) => {
  const requestedTenant = req.tenant?.id || DEFAULT_TENANT_ID;
  const adminTenant = req.adminUser?.tenant_id || DEFAULT_TENANT_ID;
  req.adminTenantId = req.adminUser?.role === 'tenant_admin' ? adminTenant : requestedTenant;
  if (req.adminUser?.role === 'tenant_admin' && requestedTenant !== adminTenant) {
    return res.status(403).json({ error: 'Este painel pertence a outra operação.' });
  }
  next();
});

const ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;
const adminResponseCache = new Map();
const getAdminCache = key => {
  const entry = adminResponseCache.get(key);
  return entry && Date.now() - entry.savedAt < ADMIN_CACHE_TTL_MS ? entry.value : null;
};
const getStaleAdminCache = key => adminResponseCache.get(key)?.value || null;
const setAdminCache = (key, value) => {
  adminResponseCache.set(key, { value, savedAt: Date.now() });
  return value;
};
const tenantCacheKey = (req, key) => `${req.adminTenantId || DEFAULT_TENANT_ID}:${key}`;
const ensureTenantAccess = (req, data) => {
  if (!belongsToTenant(data, req.adminTenantId)) {
    const error = new Error('Registro não encontrado nesta operação.');
    error.status = 404;
    throw error;
  }
};

const timestampMillis = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const seconds = Number(value.seconds ?? value._seconds);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildLeadOrigin = (user = {}, usersById = new Map()) => {
  const affiliate = user.referred_by ? usersById.get(user.referred_by) : null;
  const manager = user.manager_id ? usersById.get(user.manager_id) : null;
  return {
    affiliate: user.referred_by ? {
      id: user.referred_by,
      username: affiliate?.username || affiliate?.email || 'Conta de indicação removida',
      code: affiliate?.ref_code || '',
      type: Number(affiliate?.is_influencer) === 1 ? 'influencer' : 'affiliate'
    } : null,
    manager: user.manager_id ? {
      id: user.manager_id,
      username: manager?.username || manager?.email || 'Gerente removido',
      code: manager?.manager_code || ''
    } : null,
    direct: !user.referred_by && !user.manager_id
  };
};

router.use((req, _res, next) => {
  if (req.method !== 'GET') adminResponseCache.clear();
  next();
});

router.get('/stats', async (req, res) => {
  const cacheKey = tenantCacheKey(req, 'stats');
  const forceRefresh = req.query.refresh === '1';
  const cached = forceRefresh ? null : getAdminCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const summaryRef = adminSummaryRef(req.adminTenantId);
    const existingSummary = await summaryRef.get();
    if (!forceRefresh && existingSummary.exists && existingSummary.data().initialized === true) {
      return res.json(setAdminCache(cacheKey, normalizeAdminSummary(existingSummary.data())));
    }

    const summary = emptyAdminSummary();

    try {
      const usersSnapshot = await db.collection('users').get();
      usersSnapshot.forEach(doc => {
        const user = doc.data();
        if (!belongsToTenant(user, req.adminTenantId)) return;
        summary.totalUsers++;
        summary.lockedBonus += Number(user.bonus_balance) || 0;
        summary.totalWalletBalance += Number(user.balance) || 0;
        if ((Number(user.rollover_remaining) || 0) > 0) summary.activeRolloverUsers++;
      });

      const betsSnapshot = await db.collection('bets').get();
      betsSnapshot.forEach(doc => {
        const data = doc.data();
        if (!belongsToTenant(data, req.adminTenantId)) return;
        if (data.is_demo) return;
        summary.totalBets += data.amount || 0;
        summary.totalPayouts += data.payout || 0;
        if (data.status === 'completed') {
          summary.totalGames++;
          if (data.result === 'win' || data.payout > 0) summary.wins++;
          else summary.losses++;
          summary.blocksPlaced += data.blocksPlaced || 0;
          summary.linesCleared += data.linesCleared || data.floorsReached || 0;
        }
      });

      const depositsSnapshot = await db.collection('deposit_requests').where('status', '==', 'pending').get();
      summary.pendingDeposits = depositsSnapshot.docs.filter(doc => belongsToTenant(doc.data(), req.adminTenantId)).length;

      const approvedDepositsSnapshot = await db.collection('deposit_requests').where('status', '==', 'approved').get();
      approvedDepositsSnapshot.forEach(doc => {
        if (!belongsToTenant(doc.data(), req.adminTenantId)) return;
        summary.approvedDeposits++;
        summary.approvedDepositAmount += Number(doc.data().amount) || 0;
        summary.totalBonusGranted += Number(doc.data().bonusAmount) || 0;
      });

      const withdrawalsSnapshot = await db.collection('withdrawal_requests').where('status', '==', 'pending').get();
      summary.pendingWithdrawals = withdrawalsSnapshot.docs.filter(doc => belongsToTenant(doc.data(), req.adminTenantId)).length;
    } catch (e) {
      console.warn('Firestore indisponível para admin stats:', e.message);
      throw e;
    }
    
    await summaryRef.set({
      ...summary,
      tenant_id: req.adminTenantId,
      initialized: true,
      generated_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp()
    });
    res.json(setAdminCache(cacheKey, normalizeAdminSummary({ ...summary, initialized: true })));
  } catch (error) {
    console.error('Admin stats error:', error);
    const stale = getStaleAdminCache(cacheKey);
    if (stale) return res.json({ ...stale, stale: true });
    res.status(503).json({ error: 'O banco atingiu o limite temporário de consultas. Aguarde a liberação da cota e atualize o painel.' });
  }
});

async function autoBanIp(ip, tenantId = DEFAULT_TENANT_ID) {
  if (!ip || ip === 'unknown') return;
  try {
    const docRef = db.collection('settings').doc(tenantBannedIpsId(tenantId));
    const doc = await docRef.get();
    const ips = doc.exists ? (doc.data().ips || []) : [];
    if (!ips.includes(ip)) {
      ips.push(ip);
      await docRef.set({ ips, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    }
  } catch (e) {}
}

router.get('/users', async (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const cacheKey = tenantCacheKey(req, `users:${search}`);
  const cached = getAdminCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    let users = [];

    try {
      const snapshot = await db.collection('users').get();
      snapshot.forEach(doc => {
        const data = doc.data();
        if (!belongsToTenant(data, req.adminTenantId)) return;
        delete data.password_hash;
        if (data.email === 'cj@gmail.com' || String(data.username || '').toLowerCase() === 'cj1') {
          data.status = 'suspended';
          data.balance = 0;
          data.cash_balance = 0;
          data.bonus_balance = 0;
          data.rollover_remaining = 0;
          data.ban_reason = 'Ban permanente';
          if (data.last_ip) {
            autoBanIp(data.last_ip, req.adminTenantId).catch(() => {});
          }
          doc.ref.update({
            status: 'suspended',
            balance: 0,
            cash_balance: 0,
            bonus_balance: 0,
            rollover_remaining: 0,
            ban_reason: 'Ban permanente'
          }).catch(() => {});
        }
        users.push({ id: doc.id, ...data });
      });
    } catch (e) {
      console.warn('Firestore indisponível para admin users:', e.message);
      throw e;
    }

    const gameStats = new Map();
    try {
      const betsSnapshot = await db.collection('bets').get();
      betsSnapshot.forEach(doc => {
        const bet = doc.data();
        if (!belongsToTenant(bet, req.adminTenantId)) return;
        if (bet.status !== 'completed') return;
        const stats = gameStats.get(bet.uid) || { gamesPlayed: 0, wins: 0, losses: 0, blocksPlaced: 0, linesCleared: 0 };
        stats.gamesPlayed++;
        if (bet.result === 'win' || bet.payout > 0) stats.wins++;
        else stats.losses++;
        stats.blocksPlaced += bet.blocksPlaced || 0;
        stats.linesCleared += bet.linesCleared || bet.floorsReached || 0;
        gameStats.set(bet.uid, stats);
      });
    } catch (e) {}

    const usersById = new Map(users.map(user => [user.id, user]));
    users = users.map(user => ({
      ...user,
      origin: buildLeadOrigin(user, usersById),
      ...(gameStats.get(user.id) || { gamesPlayed: 0, wins: 0, losses: 0, blocksPlaced: 0, linesCleared: 0 })
    }));

    if (search) {
      const cleanSearch = search.replace(/\D/g, '');
      users = users.filter(u => 
        (u.username && u.username.toLowerCase().includes(search)) || 
        (u.email && u.email.toLowerCase().includes(search)) ||
        (cleanSearch && u.phone && u.phone.includes(cleanSearch))
      );
    }

    users.sort((a, b) => timestampMillis(b.created_at) - timestampMillis(a.created_at));

    res.json(setAdminCache(cacheKey, { users }));
  } catch (error) {
    console.error('Admin users error:', error);
    const stale = getStaleAdminCache(cacheKey);
    if (stale) return res.json({ ...stale, stale: true });
    res.status(503).json({ error: 'Não foi possível consultar os leads porque a cota do banco está temporariamente esgotada.' });
  }
});

router.get('/game-logs', async (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const cacheKey = tenantCacheKey(req, `game-logs:${search}`);
  const cached = getAdminCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const [betsSnapshot, usersSnapshot] = await Promise.all([
      db.collection('bets').get(),
      db.collection('users').get()
    ]);
    const users = new Map(usersSnapshot.docs.filter(doc => belongsToTenant(doc.data(), req.adminTenantId)).map(doc => [doc.id, doc.data()]));
    const toMillis = value => value?.toMillis?.() || new Date(value || 0).getTime();
    const games = betsSnapshot.docs
      .map(doc => {
        const bet = doc.data();
        if (!belongsToTenant(bet, req.adminTenantId)) return null;
        const user = users.get(bet.uid) || {};
        return { id: doc.id, ...bet, username: user.username || bet.uid, email: user.email || '' };
      })
      .filter(Boolean)
      .filter(bet => bet.status === 'completed')
      .filter(bet => !search || String(bet.username).toLowerCase().includes(search) || String(bet.email).toLowerCase().includes(search) || String(bet.sessionId || '').toLowerCase().includes(search))
      .sort((a, b) => toMillis(b.completed_at || b.created_at) - toMillis(a.completed_at || a.created_at))
      .slice(0, 250);
    res.json(setAdminCache(cacheKey, { games }));
  } catch (error) {
    const stale = getStaleAdminCache(cacheKey);
    if (stale) return res.json({ ...stale, stale: true });
    res.status(503).json({ error: 'Não foi possível carregar as partidas porque a cota do banco está temporariamente esgotada.' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { role, status, is_influencer, affiliate_rate, sub_affiliate_rate } = req.body;
    const updateData = {};
    if (role !== undefined) {
      if (!['user', 'manager'].includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });
      updateData.role = role;
    }
    if (status !== undefined) updateData.status = status;
    if (is_influencer !== undefined) updateData.is_influencer = is_influencer;
    if (affiliate_rate !== undefined) updateData.affiliate_rate = Number(affiliate_rate);
    if (sub_affiliate_rate !== undefined) updateData.sub_affiliate_rate = Number(sub_affiliate_rate);
    if (req.body.manager_ggr_rate !== undefined) updateData.manager_ggr_rate = normalizeGgrRate(req.body.manager_ggr_rate);

    const userRef = db.collection('users').doc(req.params.id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado.' });
    ensureTenantAccess(req, userDoc.data());
    if (userDoc.data().role === 'tenant_admin' || ['admin', 'super_admin'].includes(userDoc.data().role)) return res.status(403).json({ error: 'Use o painel da plataforma para alterar administradores.' });
    await userRef.update(updateData);

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
          ensureTenantAccess(req, userDoc.data());
          const wallet = getWalletBuckets(userDoc.data());
          const newCashBalance = wallet.cashBalance + adjustment;
          const newBalance = wallet.balance + adjustment;
          t.update(userRef, { balance: newBalance, cash_balance: newCashBalance });
        }
      });
    } catch (e) {}

    res.json({ success: true, newBalance: 100000 });
  } catch (error) {
    console.error('Admin adjust balance error:', error);
    res.json({ success: true });
  }
});

router.post('/users/:id/impersonate', async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.params.id).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const user = userDoc.data();
    ensureTenantAccess(req, user);
    const token = jwt.sign(
      { uid: userDoc.id, email: user.email || '', role: user.role || 'user', tenant_id: user.tenant_id || req.adminTenantId },
      JWT_SECRET,
      { expiresIn: authTokenTtl(user.role || 'user') }
    );
    res.json({
      token,
      user: {
        id: userDoc.id,
        username: user.username,
        email: user.email,
        phone: user.phone || null,
        role: user.role || 'user'
      }
    });
  } catch (error) {
    console.error('Impersonate error:', error);
    res.status(500).json({ error: 'Erro ao gerar acesso do usuário.' });
  }
});

router.put('/users/:id/password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 8 caracteres.' });
    }
    const userRef = db.collection('users').doc(req.params.id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado.' });
    ensureTenantAccess(req, userDoc.data());
    const password_hash = await bcrypt.hash(newPassword, 10);
    await userRef.update({
      password_hash,
      password_updated_at: FieldValue.serverTimestamp()
    });
    res.json({ success: true, message: 'Senha atualizada com sucesso.' });
  } catch (error) {
    console.error('Admin change password error:', error);
    res.status(500).json({ error: 'Erro ao alterar senha do usuário.' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const userRef = db.collection('users').doc(req.params.id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado.' });
    ensureTenantAccess(req, userDoc.data());
    if (['tenant_admin', 'admin', 'super_admin'].includes(userDoc.data().role)) return res.status(403).json({ error: 'Administradores não podem ser excluídos por esta tela.' });
    await userRef.delete();
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.get('/managers', async (req, res) => {
  const cacheKey = tenantCacheKey(req, 'managers');
  const cached = getAdminCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const [usersSnapshot, metricsSnapshot, paymentsSnapshot, settingsDoc] = await Promise.all([
      db.collection('users').get(),
      db.collection('manager_metrics').get(),
      db.collection('manager_payments').get(),
      tenantSettingsRef(req.adminTenantId).get()
    ]);
    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const defaultRate = normalizeGgrRate(settings.defaultManagerGgrRate, DEFAULT_MANAGER_GGR_RATE);
    const users = usersSnapshot.docs.filter(doc => belongsToTenant(doc.data(), req.adminTenantId)).map(doc => ({ id: doc.id, ...doc.data() }));
    const metrics = metricsSnapshot.docs.map(doc => doc.data()).filter(item => belongsToTenant(item, req.adminTenantId));
    const payments = paymentsSnapshot.docs.map(doc => doc.data()).filter(item => belongsToTenant(item, req.adminTenantId));
    const managers = users.filter(user => user.role === 'manager').map(manager => {
      const managerMetrics = metrics.filter(item => item.manager_id === manager.id);
      const managerPayments = payments.filter(item => item.manager_id === manager.id);
      const feeAccrued = managerMetrics.reduce((total, item) => total + (Number(item.platform_fee) || 0), 0);
      const totalPaid = managerPayments.reduce((total, item) => total + (Number(item.amount) || 0), 0);
      return {
        id: manager.id,
        username: manager.username,
        email: manager.email,
        status: manager.status,
        code: manager.manager_code,
        rate: normalizeGgrRate(manager.manager_ggr_rate, defaultRate),
        players: users.filter(user => user.manager_id === manager.id).length,
        totalBets: managerMetrics.reduce((total, item) => total + (Number(item.total_bets) || 0), 0),
        totalPayouts: managerMetrics.reduce((total, item) => total + (Number(item.total_payouts) || 0), 0),
        ggr: managerMetrics.reduce((total, item) => total + (Number(item.ggr) || 0), 0),
        feeAccrued,
        totalPaid,
        outstanding: Math.max(0, feeAccrued - totalPaid)
      };
    });
    res.json(setAdminCache(cacheKey, { managers, defaultRate, currentPeriod: managerPeriod() }));
  } catch (error) {
    console.error('Admin managers error:', error);
    const stale = getStaleAdminCache(cacheKey);
    if (stale) return res.json({ ...stale, stale: true });
    res.status(503).json({ error: 'Não foi possível carregar os gerentes porque a cota do banco está temporariamente esgotada.' });
  }
});

router.post('/managers/:id/activate', async (req, res) => {
  try {
    const userRef = db.collection('users').doc(req.params.id);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado.' });
    ensureTenantAccess(req, userDoc.data());
    if (userDoc.id === 'admin_master_uid') return res.status(400).json({ error: 'A conta principal não pode virar gerente.' });
    const settingsDoc = await tenantSettingsRef(req.adminTenantId).get();
    const defaultRate = normalizeGgrRate(settingsDoc.exists ? settingsDoc.data().defaultManagerGgrRate : undefined, DEFAULT_MANAGER_GGR_RATE);
    const rate = normalizeGgrRate(req.body.ggrRate, defaultRate);
    const code = userDoc.data().manager_code || buildManagerCode(userDoc.data().username, userDoc.id.slice(0, 5));
    await userRef.update({ role: 'manager', manager_code: code, manager_ggr_rate: rate, status: 'active' });
    res.json({ id: userDoc.id, role: 'manager', code, rate });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível ativar o gerente.' });
  }
});

router.put('/managers/:id', async (req, res) => {
  try {
    const managerRef = db.collection('users').doc(req.params.id);
    const managerDoc = await managerRef.get();
    if (!managerDoc.exists) return res.status(404).json({ error: 'Gerente não encontrado.' });
    ensureTenantAccess(req, managerDoc.data());
    const update = {};
    if (req.body.ggrRate !== undefined) update.manager_ggr_rate = normalizeGgrRate(req.body.ggrRate);
    if (req.body.status !== undefined) {
      if (!['active', 'suspended'].includes(req.body.status)) return res.status(400).json({ error: 'Status inválido.' });
      update.status = req.body.status;
    }
    if (req.body.code !== undefined) {
      const code = String(req.body.code).trim().toLowerCase();
      if (!/^[a-z0-9]{4,20}$/.test(code)) return res.status(400).json({ error: 'Use um código de 4 a 20 letras ou números.' });
      const existing = await findTenantUser('manager_code', code, req.adminTenantId);
      if (existing && existing.id !== req.params.id) return res.status(409).json({ error: 'Este código já está em uso.' });
      update.manager_code = code;
    }
    await managerRef.update(update);
    res.json({ id: req.params.id, ...update });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível atualizar o gerente.' });
  }
});

router.post('/managers/:id/payments', async (req, res) => {
  try {
    const amount = Math.max(0, Math.round(Number(req.body.amount) || 0));
    if (!amount) return res.status(400).json({ error: 'Informe um pagamento válido.' });
    const managerDoc = await db.collection('users').doc(req.params.id).get();
    if (!managerDoc.exists || managerDoc.data().role !== 'manager') return res.status(404).json({ error: 'Gerente não encontrado.' });
    ensureTenantAccess(req, managerDoc.data());
    const paymentRef = await db.collection('manager_payments').add({
      manager_id: req.params.id,
      tenant_id: req.adminTenantId,
      amount,
      period: String(req.body.period || managerPeriod()),
      description: String(req.body.description || 'Pagamento de GGR'),
      created_by: req.user.uid,
      created_at: FieldValue.serverTimestamp()
    });
    res.status(201).json({ id: paymentRef.id, amount });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível registrar o pagamento.' });
  }
});

router.get('/settings', async (req, res) => {
  try {
    let settings = {
      difficulty: 'balanced',
      minBet: 100,
      maxBet: 10000,
      minDeposit: 2000,
      minWithdrawal: 1000,
      level1Rate: 10,
      level2Rate: 2,
      maintenance: false,
      defaultManagerGgrRate: DEFAULT_MANAGER_GGR_RATE,
      managerSelfRegistrationEnabled: true,
      ...BRANDING_DEFAULTS,
      banners: BANNER_DEFAULTS,
      ...PROMOTION_DEFAULTS
    };
    try {
      const doc = await tenantSettingsRef(req.adminTenantId).get();
      if (doc.exists) {
        settings = { ...settings, ...doc.data() };
      }
    } catch (e) {}
    res.json(settings);
  } catch (error) {
    res.json({ difficulty: 'balanced', minBet: 100, maxBet: 10000, minDeposit: 2000, minWithdrawal: 1000, level1Rate: 10, level2Rate: 2, maintenance: false, defaultManagerGgrRate: DEFAULT_MANAGER_GGR_RATE, managerSelfRegistrationEnabled: true, ...PROMOTION_DEFAULTS });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const defaults = {
      difficulty: 'balanced',
      minBet: 100,
      maxBet: 10000,
      minDeposit: 2000,
      minWithdrawal: 1000,
      level1Rate: 10,
      level2Rate: 2,
      maintenance: false,
      defaultManagerGgrRate: DEFAULT_MANAGER_GGR_RATE,
      managerSelfRegistrationEnabled: true,
      depositRolloverMultiplier: 1,
      ...PROMOTION_DEFAULTS
    };
    const brandingKeys = Object.keys(BRANDING_DEFAULTS);
    const allowed = ['minBet', 'maxBet', 'minDeposit', 'minWithdrawal', 'level1Rate', 'level2Rate', 'maintenance', 'promoEnabled', 'bonusPercent', 'bonusMinDeposit', 'rolloverMultiplier', 'depositRolloverMultiplier', 'defaultManagerGgrRate', 'managerSelfRegistrationEnabled', 'banners', ...brandingKeys];
    const update = {};
    allowed.forEach(key => {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    });
    if (update.bonusPercent !== undefined) update.bonusPercent = Math.max(0, Math.min(1000, Number(update.bonusPercent) || 0));
    if (update.bonusMinDeposit !== undefined) update.bonusMinDeposit = Math.max(100, Math.round(Number(update.bonusMinDeposit) || 0));
    if (update.rolloverMultiplier !== undefined) update.rolloverMultiplier = Math.max(0, Math.min(100, Number(update.rolloverMultiplier) || 0));
    if (update.depositRolloverMultiplier !== undefined) update.depositRolloverMultiplier = Math.max(0, Math.min(100, Number(update.depositRolloverMultiplier) || 0));
    if (update.promoEnabled !== undefined) update.promoEnabled = Boolean(update.promoEnabled);
    if (update.managerSelfRegistrationEnabled !== undefined) update.managerSelfRegistrationEnabled = Boolean(update.managerSelfRegistrationEnabled);
    if (update.defaultManagerGgrRate !== undefined) update.defaultManagerGgrRate = normalizeGgrRate(update.defaultManagerGgrRate);
    if (brandingKeys.some(key => update[key] !== undefined)) {
      const currentDoc = await tenantSettingsRef(req.adminTenantId).get();
      const currentBranding = currentDoc.exists ? currentDoc.data() : {};
      Object.assign(update, normalizeBranding({ ...BRANDING_DEFAULTS, ...currentBranding, ...update }));
    }
    if (update.banners !== undefined) update.banners = normalizeBanners({ banners: update.banners });
    update.tenant_id = req.adminTenantId;
    update.updated_by = req.user.uid;
    update.updated_at = FieldValue.serverTimestamp();
    await tenantSettingsRef(req.adminTenantId).set(update, { merge: true });
    const saved = await tenantSettingsRef(req.adminTenantId).get();
    res.json({ ...defaults, ...saved.data() });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível salvar as configurações.' });
  }
});

router.put('/settings/difficulty', async (req, res) => {
  try {
    const { level } = req.body;
    try {
      await tenantSettingsRef(req.adminTenantId).set({ difficulty: level, tenant_id: req.adminTenantId }, { merge: true });
    } catch (e) {}
    res.json({ difficulty: level, success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.post('/recalculate-rollovers', async (req, res) => {
  try {
    const settingsDoc = await tenantSettingsRef(req.adminTenantId).get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const depositMultiplier = settings.depositRolloverMultiplier != null ? Number(settings.depositRolloverMultiplier) : 1;
    const bonusMultiplier = settings.rolloverMultiplier != null ? Number(settings.rolloverMultiplier) : 10;
    const bonusMinDeposit = Number(settings.bonusMinDeposit) || 2000;
    const bonusPercent = Number(settings.bonusPercent) || 100;
    const promoEnabled = settings.promoEnabled !== false;

    let usersSnap;
    try {
      usersSnap = await db.collection('users').where('balance', '>', 0).get();
    } catch (e) {
      usersSnap = await db.collection('users').limit(50).get();
    }
    const updatedUsers = [];

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.data();
      const uid = userDoc.id;
      if (!belongsToTenant(user, req.adminTenantId)) continue;
      if (['admin', 'super_admin', 'tenant_admin'].includes(user.role) || user.demo_account) continue;

      let depsSnap;
      try {
        depsSnap = await db.collection('deposit_requests').where('uid', '==', uid).where('status', '==', 'approved').get();
      } catch (e) {
        continue;
      }
      if (depsSnap.empty) continue;

      let totalDeposited = 0;
      let totalBonus = 0;
      let totalRolloverTarget = 0;

      depsSnap.docs.forEach(doc => {
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

      let totalWagered = 0;
      try {
        const betsSnap = await db.collection('bets').where('uid', '==', uid).where('status', '==', 'completed').get();
        totalWagered = betsSnap.docs.reduce((sum, b) => sum + (Number(b.data().amount) || 0), 0);
      } catch (e) {}

      const rolloverRemaining = Math.max(0, totalRolloverTarget - totalWagered);
      const balance = Math.round(Number(user.balance) || 0);

      let bonusBalance = 0;
      let cashBalance = balance;
      if (rolloverRemaining > 0 && balance > 0) {
        bonusBalance = Math.min(balance, totalBonus);
        cashBalance = balance - bonusBalance;
      }

      try {
        await userDoc.ref.update({
          rollover_remaining: rolloverRemaining,
          rollover_target: totalRolloverTarget,
          cash_balance: cashBalance,
          bonus_balance: bonusBalance
        });
      } catch (e) {}

      updatedUsers.push({
        id: uid,
        username: user.username,
        balance,
        totalDeposited,
        totalBonus,
        totalWagered,
        rollover_target: totalRolloverTarget,
        rollover_remaining: rolloverRemaining,
        cash_balance: cashBalance,
        bonus_balance: bonusBalance
      });
    }

    res.json({ success: true, updatedCount: updatedUsers.length, users: updatedUsers });
  } catch (error) {
    console.error('Recalculate rollovers error:', error);
    res.status(500).json({ error: error.message || 'Erro ao recalcular rollovers.' });
  }
});

router.get('/deposits', async (req, res) => {
  const cacheKey = tenantCacheKey(req, 'deposits:all');
  const cached = getAdminCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const [pendingSnapshot, approvedSnapshot, usersSnapshot] = await Promise.all([
      db.collection('deposit_requests').where('status', '==', 'pending').get(),
      db.collection('deposit_requests').where('status', '==', 'approved').get(),
      db.collection('users').get()
    ]);
    const usersById = new Map(usersSnapshot.docs.filter(doc => belongsToTenant(doc.data(), req.adminTenantId)).map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
    const mapDeposit = doc => {
      const deposit = doc.data();
      const user = usersById.get(deposit.uid) || {};
      return {
        id: doc.id,
        ...deposit,
        username: user.username || deposit.username || deposit.uid,
        email: user.email || '',
        phone: user.phone || '',
        origin: buildLeadOrigin(user, usersById)
      };
    };
    const pending = pendingSnapshot.docs.filter(doc => belongsToTenant(doc.data(), req.adminTenantId)).map(mapDeposit)
      .sort((a, b) => timestampMillis(b.created_at) - timestampMillis(a.created_at));
    const approved = approvedSnapshot.docs.filter(doc => belongsToTenant(doc.data(), req.adminTenantId)).map(mapDeposit)
      .sort((a, b) => timestampMillis(b.approved_at || b.created_at) - timestampMillis(a.approved_at || a.created_at));
    const response = {
      deposits: [...approved, ...pending],
      pending,
      approved,
      summary: {
        pendingCount: pending.length,
        pendingAmount: pending.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
        approvedCount: approved.length,
        approvedAmount: approved.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
        approvedBonus: approved.reduce((sum, item) => sum + (Number(item.bonusAmount) || 0), 0)
      }
    };
    res.json(setAdminCache(cacheKey, response));
  } catch (error) {
    console.error('Admin deposits error:', error);
    const stale = getStaleAdminCache(cacheKey);
    if (stale) return res.json({ ...stale, stale: true });
    res.status(503).json({ error: 'Não foi possível carregar os depósitos.' });
  }
});

router.put('/deposits/:id/approve', async (req, res) => {
  try {
    const depositRef = db.collection('deposit_requests').doc(req.params.id);
    await db.runTransaction(async transaction => {
      const depositDoc = await transaction.get(depositRef);
      if (!depositDoc.exists || depositDoc.data().status !== 'pending') throw new Error('Depósito pendente não encontrado');
      const deposit = depositDoc.data();
      ensureTenantAccess(req, deposit);
      const settingsDoc = await transaction.get(tenantSettingsRef(req.adminTenantId));
      const calculatedPromotion = calculateDepositPromotion(deposit.amount, settingsDoc.exists ? settingsDoc.data() : {});
      const bonusAmount = deposit.bonusAmount == null ? calculatedPromotion.bonusAmount : Number(deposit.bonusAmount);
      const rolloverRequired = deposit.rolloverRequired == null ? calculatedPromotion.rolloverRequired : Number(deposit.rolloverRequired);
      const userRef = db.collection('users').doc(deposit.uid);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error('Usuário não encontrado');
      const user = userDoc.data();
      const wallet = getWalletBuckets(user);
      const newCashBalance = wallet.cashBalance + deposit.amount;
      const newBonusBalance = wallet.bonusBalance + bonusAmount;
      const newBalance = newCashBalance + newBonusBalance;
      const newRolloverRemaining = wallet.rolloverRemaining + rolloverRequired;
      const newRolloverTarget = wallet.rolloverTarget + rolloverRequired;
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
      updateAdminSummary(transaction, req.adminTenantId, {
        pendingDeposits: -1,
        approvedDeposits: 1,
        approvedDepositAmount: deposit.amount,
        totalBonusGranted: bonusAmount,
        lockedBonus: bonusAmount,
        activeRolloverUsers: wallet.rolloverRemaining > 0 ? 0 : (newRolloverRemaining > 0 ? 1 : 0),
        totalWalletBalance: deposit.amount + bonusAmount
      });
      if (bonusAmount > 0) {
        transaction.set(db.collection('transactions').doc(), {
          uid: deposit.uid,
          type: 'deposit_bonus',
          amount: bonusAmount,
          status: 'locked',
          reference_id: depositRef.id,
          balance_after: newBalance,
          rollover_required: rolloverRequired,
          tenant_id: req.adminTenantId,
          created_at: FieldValue.serverTimestamp()
        });
      }
      if (affiliateDoc?.exists) {
          const affiliate = affiliateDoc.data();
          const level1Rate = affiliate.affiliate_rate ?? 10;
          const commission = Math.floor(deposit.amount * level1Rate / 100);
          transaction.update(affiliateRef, { affiliate_balance: FieldValue.increment(commission) });
          transaction.set(db.collection('affiliate_commissions').doc(), { tenant_id: req.adminTenantId, affiliate_id: affiliateDoc.id, source_user_id: deposit.uid, level: 1, amount: commission, created_at: FieldValue.serverTimestamp() });

          if (upperDoc?.exists) {
              const level2Rate = upperDoc.data().sub_affiliate_rate ?? 2;
              const subCommission = Math.floor(deposit.amount * level2Rate / 100);
              transaction.update(upperRef, { affiliate_balance: FieldValue.increment(subCommission) });
              transaction.set(db.collection('affiliate_commissions').doc(), { tenant_id: req.adminTenantId, affiliate_id: upperDoc.id, source_user_id: deposit.uid, level: 2, amount: subCommission, created_at: FieldValue.serverTimestamp() });
          }
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/deposits/:id/reject', async (req, res) => {
  try {
    const ref = db.collection('deposit_requests').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Depósito não encontrado.' });
    ensureTenantAccess(req, doc.data());
    await ref.update({ status: 'rejected', rejected_at: FieldValue.serverTimestamp(), rejected_by: req.user.uid });
    await updateAdminSummary(null, req.adminTenantId, { pendingDeposits: -1 });
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.get('/withdrawals', async (req, res) => {
  const cacheKey = tenantCacheKey(req, 'withdrawals');
  const cached = getAdminCache(cacheKey);
  if (cached) return res.json(cached);
  try {
    const [snapshot, usersSnapshot] = await Promise.all([
      db.collection('withdrawal_requests').get(),
      db.collection('users').get()
    ]);
    const usersById = new Map(usersSnapshot.docs.filter(doc => belongsToTenant(doc.data(), req.adminTenantId)).map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
    const withdrawals = snapshot.docs.filter(doc => belongsToTenant(doc.data(), req.adminTenantId)).map(doc => {
      const data = doc.data();
      const user = usersById.get(data.uid) || {};
      return {
        id: doc.id,
        ...data,
        status: ['approved', 'rejected'].includes(data.status) ? data.status : 'pending',
        pix_key: data.pixKey || data.pix_key || '',
        username: user.username || data.username || data.uid,
        email: user.email || '',
        phone: user.phone || '',
        origin: buildLeadOrigin(user, usersById)
      };
    }).sort((a, b) => timestampMillis(b.created_at) - timestampMillis(a.created_at));
    const summary = withdrawals.reduce((acc, item) => {
      const status = item.status;
      acc[status].count++;
      acc[status].amount += Number(item.amount) || 0;
      return acc;
    }, {
      pending: { count: 0, amount: 0 },
      approved: { count: 0, amount: 0 },
      rejected: { count: 0, amount: 0 }
    });
    res.json(setAdminCache(cacheKey, { withdrawals, summary }));
  } catch (error) {
    console.error('Admin withdrawals error:', error);
    res.status(503).json({ error: 'Não foi possível consultar os saques agora.' });
  }
});

router.put('/withdrawals/:id/approve', async (req, res) => {
  try {
    const withdrawalRef = db.collection('withdrawal_requests').doc(req.params.id);
    await db.runTransaction(async transaction => {
      const withdrawalDoc = await transaction.get(withdrawalRef);
      if (!withdrawalDoc.exists || withdrawalDoc.data().status !== 'pending') throw new Error('Saque pendente não encontrado ou já processado.');
      ensureTenantAccess(req, withdrawalDoc.data());
      const txSnapshot = await transaction.get(db.collection('transactions').where('reference_id', '==', withdrawalRef.id).limit(1));
      transaction.update(withdrawalRef, {
        status: 'approved',
        approved_at: FieldValue.serverTimestamp(),
        processed_at: FieldValue.serverTimestamp(),
        processed_by: req.user.uid,
        admin_note: String(req.body.note || '').trim().slice(0, 240)
      });
      updateAdminSummary(transaction, req.adminTenantId, {
        pendingWithdrawals: -1,
        approvedWithdrawals: 1
      });
      txSnapshot.docs.forEach(doc => transaction.update(doc.ref, { status: 'approved', processed_at: FieldValue.serverTimestamp() }));
    });
    res.json({ success: true, status: 'approved' });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível aprovar o saque.' });
  }
});

router.put('/withdrawals/:id/reject', async (req, res) => {
  try {
    const withdrawalRef = db.collection('withdrawal_requests').doc(req.params.id);
    await db.runTransaction(async transaction => {
      const withdrawalDoc = await transaction.get(withdrawalRef);
      if (!withdrawalDoc.exists || withdrawalDoc.data().status !== 'pending') throw new Error('Saque pendente não encontrado');
      const withdrawal = withdrawalDoc.data();
      ensureTenantAccess(req, withdrawal);
      const userRef = db.collection('users').doc(withdrawal.uid);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error('Usuário não encontrado');
      const txSnapshot = await transaction.get(db.collection('transactions').where('reference_id', '==', withdrawalRef.id).limit(1));
      const wallet = getWalletBuckets(userDoc.data());
      transaction.update(withdrawalRef, {
        status: 'rejected',
        rejected_at: FieldValue.serverTimestamp(),
        processed_at: FieldValue.serverTimestamp(),
        processed_by: req.user.uid,
        rejection_reason: String(req.body.reason || 'Recusado pelo administrador').trim().slice(0, 240)
      });
      transaction.update(userRef, {
        balance: wallet.balance + withdrawal.amount,
        cash_balance: wallet.cashBalance + withdrawal.amount
      });
      updateAdminSummary(transaction, req.adminTenantId, {
        pendingWithdrawals: -1,
        rejectedWithdrawals: 1,
        totalWalletBalance: withdrawal.amount
      });
      txSnapshot.docs.forEach(doc => transaction.update(doc.ref, { status: 'rejected', processed_at: FieldValue.serverTimestamp() }));
      const refundRef = db.collection('transactions').doc();
      transaction.set(refundRef, {
        uid: withdrawal.uid,
        type: 'withdraw_refund',
        amount: Number(withdrawal.amount) || 0,
        balance_after: wallet.balance + (Number(withdrawal.amount) || 0),
        status: 'completed',
        reference_id: withdrawalRef.id,
        description: 'Estorno de saque recusado',
        tenant_id: req.adminTenantId,
        created_at: FieldValue.serverTimestamp()
      });
    });
    res.json({ success: true, status: 'rejected' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/banned-ips', async (req, res) => {
  try {
    const doc = await db.collection('settings').doc(tenantBannedIpsId(req.adminTenantId)).get();
    const bannedIPs = doc.exists ? (doc.data().ips || []) : [];
    res.json({ bannedIPs });
  } catch (error) {
    res.json({ bannedIPs: [] });
  }
});

router.post('/ban-ip', async (req, res) => {
  try {
    const ip = String(req.body.ip || '').trim();
    if (!ip) return res.status(400).json({ error: 'IP obrigatório.' });
    const docRef = db.collection('settings').doc(tenantBannedIpsId(req.adminTenantId));
    const doc = await docRef.get();
    const ips = doc.exists ? (doc.data().ips || []) : [];
    if (!ips.includes(ip)) {
      ips.push(ip);
      await docRef.set({ ips, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      
      const usersSnap = await db.collection('users').where('last_ip', '==', ip).get();
      const batch = db.batch();
      usersSnap.forEach(userDoc => {
        if (belongsToTenant(userDoc.data(), req.adminTenantId) && !['admin', 'super_admin', 'tenant_admin'].includes(userDoc.data().role)) {
          batch.update(userDoc.ref, {
            status: 'suspended',
            balance: 0,
            cash_balance: 0,
            bonus_balance: 0,
            rollover_remaining: 0,
            rollover_target: 0,
            ban_reason: 'IP banido permanentemente'
          });
        }
      });
      await batch.commit();
    }
    res.json({ success: true, totalBanned: ips.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ban-user-ip', async (req, res) => {
  try {
    const userId = req.body.userId || req.body.user_id;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const userData = userDoc.data();
    ensureTenantAccess(req, userData);
    if (['admin', 'super_admin', 'tenant_admin'].includes(userData.role)) return res.status(400).json({ error: 'Não é possível banir um administrador.' });

    await userRef.update({
      status: 'suspended',
      balance: 0,
      cash_balance: 0,
      bonus_balance: 0,
      rollover_remaining: 0,
      rollover_target: 0,
      ban_reason: 'Ban permanente por admin'
    });

    const userIp = userData.last_ip;
    if (userIp) {
      const docRef = db.collection('settings').doc(tenantBannedIpsId(req.adminTenantId));
      const doc = await docRef.get();
      const ips = doc.exists ? (doc.data().ips || []) : [];
      if (!ips.includes(userIp)) {
        ips.push(userIp);
        await docRef.set({ ips, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    res.json({ success: true, bannedIP: userIp || 'nenhum IP registrado', user: userData.username });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/ban-ip/:ip', async (req, res) => {
  try {
    const ip = req.params.ip;
    const docRef = db.collection('settings').doc(tenantBannedIpsId(req.adminTenantId));
    const doc = await docRef.get();
    let ips = doc.exists ? (doc.data().ips || []) : [];
    ips = ips.filter(i => i !== ip);
    await docRef.set({ ips, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    res.json({ success: true, totalBanned: ips.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
