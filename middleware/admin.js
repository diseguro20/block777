import { db } from '../lib/firebase.js';

export async function requireAdmin(req, res, next) {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const user = userDoc.exists ? userDoc.data() : null;
    const allowed = ['admin', 'super_admin', 'tenant_admin'];
    if (user && allowed.includes(user.role) && user.status !== 'suspended') {
      const tokenTenant = req.user.tenant_id || 'blockerino';
      const userTenant = user.tenant_id || 'blockerino';
      if (user.role === 'tenant_admin' && tokenTenant !== userTenant) {
        return res.status(403).json({ error: 'Sessão não pertence a esta operação.' });
      }
      req.adminUser = { id: userDoc.id, ...user };
      return next();
    }
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
}
