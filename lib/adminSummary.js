import { db, FieldValue } from './firebase.js';
import { DEFAULT_TENANT_ID, normalizeTenantSlug } from './tenant.js';

export const ADMIN_SUMMARY_FIELDS = [
  'totalUsers', 'totalBets', 'totalPayouts', 'pendingDeposits',
  'approvedDeposits', 'approvedDepositAmount', 'pendingWithdrawals',
  'approvedWithdrawals', 'rejectedWithdrawals', 'totalGames', 'wins',
  'losses', 'blocksPlaced', 'linesCleared', 'totalBonusGranted',
  'lockedBonus', 'activeRolloverUsers', 'totalWalletBalance'
];

export const emptyAdminSummary = () => Object.fromEntries(ADMIN_SUMMARY_FIELDS.map(field => [field, 0]));

export const adminSummaryRef = (tenantId = DEFAULT_TENANT_ID, database = db) =>
  database.collection('admin_summaries').doc(normalizeTenantSlug(tenantId) || DEFAULT_TENANT_ID);

export function summaryIncrements(values = {}) {
  return Object.fromEntries(Object.entries(values)
    .filter(([field, value]) => ADMIN_SUMMARY_FIELDS.includes(field) && Number.isFinite(Number(value)) && Number(value) !== 0)
    .map(([field, value]) => [field, FieldValue.increment(Number(value))]));
}

export function updateAdminSummary(target, tenantId, increments = {}, extra = {}) {
  const payload = {
    tenant_id: normalizeTenantSlug(tenantId) || DEFAULT_TENANT_ID,
    ...summaryIncrements(increments),
    ...extra,
    updated_at: FieldValue.serverTimestamp()
  };
  const ref = adminSummaryRef(tenantId);
  if (target && typeof target.set === 'function') {
    target.set(ref, payload, { merge: true });
    return;
  }
  return ref.set(payload, { merge: true });
}

export function normalizeAdminSummary(data = {}) {
  const summary = emptyAdminSummary();
  ADMIN_SUMMARY_FIELDS.forEach(field => { summary[field] = Number(data[field]) || 0; });
  summary.houseProfit = summary.totalBets - summary.totalPayouts;
  summary.initialized = data.initialized === true;
  summary.generatedAt = data.generated_at || data.updated_at || null;
  return summary;
}
