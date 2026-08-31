import { db } from '../lib/firebase.js';
import { DEFAULT_TENANT_ID, belongsToTenant } from '../lib/tenant.js';

export async function requireManager(req, res, next) {
  if (req.user?.role !== 'manager') {
    return res.status(403).json({ error: 'Acesso restrito a gerentes.' });
  }

  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (userDoc.exists) {
      if (userDoc.data().role !== 'manager') {
        return res.status(403).json({ error: 'Acesso restrito a gerentes.' });
      }
      if (userDoc.data().status === 'suspended') {
        return res.status(403).json({ error: 'Conta de gerente suspensa.' });
      }
      if (!belongsToTenant(userDoc.data(), req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID)) {
        return res.status(403).json({ error: 'Gerente não pertence a esta operação.' });
      }
      req.managerUser = { id: userDoc.id, ...userDoc.data() };
      return next();
    }
  } catch (error) {
    return res.status(503).json({ error: 'Não foi possível validar a conta do gerente.' });
  }
  return res.status(403).json({ error: 'Conta de gerente não encontrada.' });
}
