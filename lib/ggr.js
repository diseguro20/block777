export const DEFAULT_MANAGER_GGR_RATE = 30;

export function normalizeGgrRate(value, fallback = DEFAULT_MANAGER_GGR_RATE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return normalizeGgrRate(fallback, DEFAULT_MANAGER_GGR_RATE);
  return Math.max(0, Math.min(100, Math.round(parsed * 100) / 100));
}

export function calculateGgrEntry({ betAmount, payout, rate }) {
  const safeBet = Math.max(0, Math.round(Number(betAmount) || 0));
  const safePayout = Math.max(0, Math.round(Number(payout) || 0));
  const safeRate = normalizeGgrRate(rate);
  const ggr = safeBet - safePayout;
  const platformFee = Math.round(ggr * safeRate / 100);
  return { betAmount: safeBet, payout: safePayout, ggr, rate: safeRate, platformFee };
}

export function managerPeriod(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value || String(date.getUTCFullYear());
  const month = parts.find(part => part.type === 'month')?.value || String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function buildManagerCode(username, suffix = '') {
  const base = String(username || 'gerente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 14) || 'gerente';
  return `${base}${String(suffix).toLowerCase()}`.slice(0, 20);
}
