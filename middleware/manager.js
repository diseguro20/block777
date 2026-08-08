import { db } from '../lib/firebase.js';

export async function requireManager(req, res, next) {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'manager') {
      return res.status(403).json({ error: 'Acesso restrito a gerentes.' });
    }
    if (userDoc.data().status === 'suspended') {
      return res.status(403).json({ error: 'Conta de gerente suspensa.' });
    }
    req.managerUser = { id: userDoc.id, ...userDoc.data() };
    next();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar a conta do gerente.' });
  }
}
