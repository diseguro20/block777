const unsafeFallback = 'blockerino-local-development-only';

export function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (secret.length >= 32) return secret;
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET ausente ou inseguro. Configure um segredo com pelo menos 32 caracteres.');
  }
  return unsafeFallback;
}

export const authTokenTtl = role => ['admin', 'super_admin', 'tenant_admin'].includes(role) ? '12h' : '7d';
