import express from 'express';
import bcrypt from 'bcryptjs';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { BRANDING_DEFAULTS } from '../lib/branding.js';
import { BANNER_DEFAULTS } from '../lib/banners.js';
import { clearTenantCache, isSharedTenantHost, normalizeTenantDomain, normalizeTenantSlug, RESERVED_TENANT_SLUGS, tenantSettingsRef } from '../lib/tenant.js';
import { PROMOTION_DEFAULTS } from '../lib/promotion.js';

const router = express.Router();
router.use(authenticateToken);
router.use(async (req, res, next) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const user = userDoc.exists ? userDoc.data() : null;
    if (!user || !['admin', 'super_admin'].includes(user.role) || user.status === 'suspended') {
      return res.status(403).json({ error: 'Acesso exclusivo do administrador da plataforma.' });
    }
    req.platformAdmin = { id: userDoc.id, ...user };
    next();
  } catch (_) {
    res.status(500).json({ error: 'Não foi possível validar o administrador da plataforma.' });
  }
});

router.get('/tenants', async (_req, res) => {
  const snapshot = await db.collection('tenants').get();
  const tenants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  res.json({ tenants });
});

const normalizeDeployment = (source = {}) => ({
  mode: source.mode === 'shared' ? 'shared' : 'isolated',
  status: ['awaiting_resources', 'configuring', 'ready', 'failed'].includes(source.status) ? source.status : 'awaiting_resources',
  vercelProjectId: String(source.vercelProjectId || '').trim().slice(0, 100),
  firebaseProjectId: String(source.firebaseProjectId || '').trim().slice(0, 100),
  productionUrl: (() => {
    const value = String(source.productionUrl || '').trim().slice(0, 240);
    if (!value) return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.origin : '';
    } catch (_) { return ''; }
  })()
});

router.post('/tenants', async (req, res) => {
  try {
    const slug = normalizeTenantSlug(req.body.slug);
    const name = String(req.body.name || '').replace(/[<>]/g, '').trim().slice(0, 80);
    const adminName = String(req.body.adminName || '').replace(/[<>]/g, '').trim().slice(0, 80);
    const adminEmail = String(req.body.adminEmail || '').trim().toLowerCase().slice(0, 120);
    const password = String(req.body.password || '');
    const deploymentMode = req.body.deploymentMode === 'shared' ? 'shared' : 'isolated';
    const domains = [...new Set((Array.isArray(req.body.domains) ? req.body.domains : String(req.body.domain || '').split(','))
      .map(normalizeTenantDomain)
      .filter(Boolean))].slice(0, 10);
    if (slug.length < 3 || name.length < 2 || adminName.length < 2 || !adminEmail.includes('@') || password.length < 10) {
      return res.status(400).json({ error: 'Informe slug, empresa, administrador, e-mail e senha com pelo menos 10 caracteres.' });
    }
    if (RESERVED_TENANT_SLUGS.has(slug)) {
      return res.status(409).json({ error: 'Este identificador é reservado para a plataforma principal.' });
    }
    if (domains.some(domain => isSharedTenantHost(domain))) {
      return res.status(409).json({ error: 'Use apenas domínios próprios do cliente. Endereços da plataforma e da Vercel são reservados.' });
    }

    for (const domain of domains) {
      const duplicate = await db.collection('tenants').where('domains', 'array-contains', domain).limit(1).get();
      if (!duplicate.empty) return res.status(409).json({ error: `O domínio ${domain} já pertence a outra white label.` });
    }

    const tenantRef = db.collection('tenants').doc(slug);
    const settingsRef = tenantSettingsRef(slug);
    const adminRef = db.collection('users').doc(`${slug}_admin_${Buffer.from(adminEmail).toString('hex').slice(0, 32)}`);
    const password_hash = await bcrypt.hash(password, 12);
    await db.runTransaction(async transaction => {
      const [tenantDoc, adminDoc] = await Promise.all([transaction.get(tenantRef), transaction.get(adminRef)]);
      if (tenantDoc.exists || adminDoc.exists) throw new Error('Esta operação ou administrador já existe.');
      transaction.set(tenantRef, {
        slug, name, domains, status: 'active',
        deployment: {
          mode: deploymentMode,
          status: deploymentMode === 'shared' ? 'ready' : 'awaiting_resources',
          vercelProjectId: '',
          firebaseProjectId: '',
          productionUrl: ''
        },
        created_by: req.platformAdmin.id,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp()
      });
      transaction.set(settingsRef, {
        ...BRANDING_DEFAULTS,
        brandName: name.toUpperCase().slice(0, 40),
        ...PROMOTION_DEFAULTS,
        banners: BANNER_DEFAULTS,
        difficulty: 'impossible', minBet: 100, maxBet: 10000, minDeposit: 2000, minWithdrawal: 1000,
        level1Rate: 10, level2Rate: 2, defaultManagerGgrRate: 30,
        managerSelfRegistrationEnabled: false, maintenance: false,
        tenant_id: slug,
        created_at: FieldValue.serverTimestamp()
      });
      transaction.set(adminRef, {
        tenant_id: slug,
        username: adminName,
        email: adminEmail,
        password_hash,
        role: 'tenant_admin',
        status: 'active',
        balance: 0, cash_balance: 0, bonus_balance: 0,
        created_by: req.platformAdmin.id,
        created_at: FieldValue.serverTimestamp()
      });
    });
    clearTenantCache();
    res.status(201).json({
      tenant: {
        id: slug, slug, name, domains, status: 'active',
        deployment: { mode: deploymentMode, status: deploymentMode === 'shared' ? 'ready' : 'awaiting_resources' }
      },
      admin: { email: adminEmail, username: adminName }
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível criar o cliente.' });
  }
});

router.put('/tenants/:id/deployment', async (req, res) => {
  try {
    const id = normalizeTenantSlug(req.params.id);
    const tenantRef = db.collection('tenants').doc(id);
    const tenantDoc = await tenantRef.get();
    if (!tenantDoc.exists) return res.status(404).json({ error: 'Cliente white label não encontrado.' });
    const current = normalizeDeployment(tenantDoc.data().deployment || {});
    const next = normalizeDeployment({ ...current, ...req.body });
    if (next.mode === 'isolated' && next.status === 'ready' && (!next.vercelProjectId || !next.firebaseProjectId || !next.productionUrl)) {
      return res.status(400).json({ error: 'Vercel, Firebase e URL de produção são obrigatórios para marcar a implantação isolada como pronta.' });
    }
    await tenantRef.update({
      deployment: next,
      updated_at: FieldValue.serverTimestamp(),
      updated_by: req.platformAdmin.id
    });
    res.json({ id, deployment: next });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível atualizar a implantação.' });
  }
});

router.put('/tenants/:id/status', async (req, res) => {
  const id = normalizeTenantSlug(req.params.id);
  const status = req.body.status === 'suspended' ? 'suspended' : 'active';
  await db.collection('tenants').doc(id).update({ status, updated_at: FieldValue.serverTimestamp(), updated_by: req.platformAdmin.id });
  clearTenantCache();
  res.json({ id, status });
});

export default router;
