import { db } from '../lib/firebase.js';

export async function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (userDoc.exists && userDoc.data().role === 'admin') {
      req.adminUser = userDoc.data();
      return next();
    }
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
}
