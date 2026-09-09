import crypto from 'crypto';

export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;

export function createPasswordResetCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashPasswordResetCode(requestId, code, secret) {
  return crypto.createHmac('sha256', String(secret))
    .update(`${String(requestId)}:${String(code)}`)
    .digest('hex');
}

export function safeCodeMatch(expected, received) {
  const left = Buffer.from(String(expected || ''), 'hex');
  const right = Buffer.from(String(received || ''), 'hex');
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function passwordResetExpiry(now = Date.now()) {
  return new Date(now + PASSWORD_RESET_TTL_MS);
}

export function isPasswordResetExpired(value, now = Date.now()) {
  const millis = typeof value?.toMillis === 'function'
    ? value.toMillis()
    : new Date(value || 0).getTime();
  return !Number.isFinite(millis) || millis <= now;
}

export function maskResetContact(user = {}) {
  const phone = String(user.phone || '').replace(/\D/g, '');
  if (phone.length >= 4) return `***${phone.slice(-4)}`;
  const email = String(user.email || '');
  const [name, domain] = email.split('@');
  if (name && domain && !domain.endsWith('block777.com')) return `${name.slice(0, 2)}***@${domain}`;
  return 'contato cadastrado';
}
