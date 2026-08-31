import jwt from 'jsonwebtoken';
import { authTokenTtl, getJwtSecret } from '../lib/security.js';

const JWT_SECRET = getJwtSecret();

export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: authTokenTtl(payload.role) });
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação necessário' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const tokenTenant = decoded.tenant_id || 'blockerino';
    const requestTenant = req.tenant?.id || 'blockerino';
    if (!['admin', 'super_admin'].includes(decoded.role) && tokenTenant !== requestTenant) {
      return res.status(403).json({ error: 'Esta sessão pertence a outra operação.' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }
}
