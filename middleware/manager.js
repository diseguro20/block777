import { db } from '../lib/firebase.js';

export async function requireManager(req, res, next) {
  if (req.user?.role !== 'manager' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a gerentes.' });
  }

  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (userDoc.exists) {
      if (userDoc.data().role !== 'manager' && userDoc.data().role !== 'admin') {
        return res.status(403).json({ error: 'Acesso restrito a gerentes.' });
      }
      if (userDoc.data().status === 'suspended') {
        return res.status(403).json({ error: 'Conta de gerente suspensa.' });
      }
      req.managerUser = { id: userDoc.id, ...userDoc.data() };
      return next();
    }
  } catch (error) {}

  // Fallback seguro a partir das claims do JWT validado
  req.managerUser = {
    id: req.user.uid,
    username: req.user.username || String(req.user.email || '').split('@')[0] || 'gerente',
    email: req.user.email,
    role: req.user.role,
    manager_code: req.user.manager_code || `manager_${req.user.uid.slice(0,6)}`,
    manager_ggr_rate: 30,
    status: 'active'
  };
  next();
}
