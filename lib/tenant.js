import { db } from './firebase.js';

export const DEFAULT_TENANT_ID = 'blockerino';
export const RESERVED_TENANT_SLUGS = new Set([DEFAULT_TENANT_ID, 'admin', 'api', 'www']);
const tenantCache = new Map();
const TENANT_CACHE_MS = 60 * 1000;

export const normalizeTenantSlug = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, '')
  .replace(/^-+|-+$/g, '')
  .slice(0, 40);

export const recordTenantId = data => normalizeTenantSlug(data?.tenant_id) || DEFAULT_TENANT_ID;
export const belongsToTenant = (data, tenantId) => recordTenantId(data) === (normalizeTenantSlug(tenantId) || DEFAULT_TENANT_ID);
export const tenantSettingsId = tenantId => tenantId === DEFAULT_TENANT_ID ? 'global' : `tenant_${normalizeTenantSlug(tenantId)}`;
export const tenantSettingsRef = (tenantId, database = db) => database.collection('settings').doc(tenantSettingsId(tenantId));
export const tenantBannedIpsId = tenantId => tenantId === DEFAULT_TENANT_ID ? 'banned_ips' : `banned_ips_${normalizeTenantSlug(tenantId)}`;

export const normalizeTenantDomain = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .split('/')[0]
  .split(':')[0]
  .replace(/^\.+|\.+$/g, '');

export const isSharedTenantHost = value => {
  const host = normalizeTenantDomain(value);
  return !host || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app');
};

export const requestedTenantForHost = (host, candidates = {}) => {
  if (!isSharedTenantHost(host)) return '';
  return normalizeTenantSlug(candidates.query || candidates.header || candidates.body);
};

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase().split(':')[0];
}

async function loadTenant(slug, host) {
  const cacheKey = slug || `host:${host}`;
  const cached = tenantCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < TENANT_CACHE_MS) return cached.value;

  let tenant = null;
  if (slug === DEFAULT_TENANT_ID || (!slug && isSharedTenantHost(host))) {
    tenant = { id: DEFAULT_TENANT_ID, slug: DEFAULT_TENANT_ID, status: 'active', name: 'BLOCKERINO', domains: ['block777-omega.vercel.app'] };
  } else if (slug) {
    const doc = await db.collection('tenants').doc(slug).get();
    if (doc.exists) tenant = { id: doc.id, ...doc.data() };
  } else if (host) {
    const snapshot = await db.collection('tenants').where('domains', 'array-contains', host).limit(1).get();
    if (!snapshot.empty) tenant = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }
  if (tenant) tenantCache.set(cacheKey, { value: tenant, savedAt: Date.now() });
  return tenant;
}

export async function tenantContext(req, res, next) {
  try {
    const host = requestHost(req);
    const slug = requestedTenantForHost(host, {
      query: req.query.tenant,
      header: req.headers['x-tenant-slug'],
      body: req.body?.tenant_slug
    });
    const tenant = await loadTenant(slug, host);
    if (!tenant) return res.status(404).json({ error: 'Operação white-label não encontrada.' });
    if (tenant.status === 'suspended') return res.status(423).json({ error: 'Esta operação está temporariamente suspensa.' });
    req.tenant = tenant;
    next();
  } catch (error) {
    res.status(503).json({ error: 'Não foi possível identificar a operação.' });
  }
}

export function clearTenantCache() {
  tenantCache.clear();
}
