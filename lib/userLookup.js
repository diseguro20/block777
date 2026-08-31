import { db } from './firebase.js';
import { belongsToTenant } from './tenant.js';

const ALLOWED_FIELDS = new Set(['email', 'phone', 'username', 'ref_code', 'manager_code']);

export async function findTenantUsers(field, value, tenantId, limit = 50) {
  if (!ALLOWED_FIELDS.has(field)) throw new Error('Campo de busca inválido.');
  const snapshot = await db.collection('users').where(field, '==', value).limit(limit).get();
  return snapshot.docs.filter(doc => belongsToTenant(doc.data(), tenantId));
}

export async function findTenantUser(field, value, tenantId) {
  return (await findTenantUsers(field, value, tenantId, 50))[0] || null;
}
