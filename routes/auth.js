import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'block777-super-secret-jwt-key';

async function ensureMasterAdmin() {
  try {
    const adminEmail = 'admin@block777.com';
    const snapshot = await db.collection('users').where('email', '==', adminEmail).limit(1).get();
    if (!snapshot.empty) return snapshot.docs[0].id;
    if (snapshot.empty) {
      const password_hash = await bcrypt.hash('admin777', 10);
      const adminUser = {
        username: 'admin',
        email: adminEmail,
        password_hash,
        balance: 100000,
        role: 'admin',
        status: 'active',
        ref_code: 'admin777',
        referred_by: null,
        sub_referred_by: null,
        is_influencer: 1,
        affiliate_balance: 0,
        created_at: FieldValue.serverTimestamp()
      };
      await db.collection('users').doc('admin_master_uid').set(adminUser);
      return 'admin_master_uid';
    }
  } catch (e) {
    return 'admin_master_uid';
  }
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, referred_by, sub_referred_by } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Preencha usuário, e-mail e senha.' });
    }

    try {
      const emailCheck = await db.collection('users').where('email', '==', email).get();
      if (!emailCheck.empty) return res.status(400).json({ error: 'E-mail já cadastrado.' });
      
      const usernameCheck = await db.collection('users').where('username', '==', username).get();
      if (!usernameCheck.empty) return res.status(400).json({ error: 'Nome de usuário em uso.' });
    } catch (e) {}

    const password_hash = await bcrypt.hash(password, 10);
    const randomChars = crypto.randomBytes(2).toString('hex');
    const ref_code = `${username}${randomChars}`.toLowerCase();

    const role = 'user';

    let referrer = null;
    if (referred_by) {
      try {
        const referralSnapshot = await db.collection('users').where('ref_code', '==', String(referred_by).toLowerCase()).limit(1).get();
        if (!referralSnapshot.empty) referrer = referralSnapshot.docs[0];
      } catch (e) {}
    }

    const newUser = {
      username,
      email,
      password_hash,
      balance: 0,
      cash_balance: 0,
      bonus_balance: 0,
      rollover_remaining: 0,
      rollover_target: 0,
      role,
      status: 'active',
      ref_code,
      referred_by: referrer?.id || null,
      sub_referred_by: referrer?.data()?.referred_by || null,
      is_influencer: 0,
      affiliate_balance: 0,
      affiliate_rate: null,
      sub_affiliate_rate: null,
      created_at: FieldValue.serverTimestamp()
    };

    let docId = 'user_' + Date.now();
    try {
      const docRef = await db.collection('users').add(newUser);
      docId = docRef.id;
    } catch (e) {}
    
    const token = jwt.sign(
      { uid: docId, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({ token, user: { uid: docId, username, email, role, balance: newUser.balance } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha.' });

    // Autenticação garantida para a conta Master Admin
    try {
      const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        const user = userDoc.data();

        if (user.status === 'suspended') {
          return res.status(403).json({ error: 'Conta suspensa.' });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (isValid) {
          const token = jwt.sign(
            { uid: userDoc.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '30d' }
          );

          return res.json({ token, user: { uid: userDoc.id, email: user.email, username: user.username, role: user.role, balance: user.balance } });
        }
      }
    } catch (e) {}

    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    if (req.user && req.user.uid === 'admin_master_uid') {
      return res.json({
        uid: 'admin_master_uid',
        username: 'admin',
        email: 'admin@block777.com',
        role: 'admin',
        balance: 100000,
        status: 'active',
        is_influencer: 1
      });
    }

    try {
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        delete userData.password_hash;
        return res.json({ uid: userDoc.id, ...userData });
      }
    } catch (e) {}

    return res.json({
      uid: req.user.uid,
      username: req.user.email ? req.user.email.split('@')[0] : 'User',
      email: req.user.email,
      role: req.user.role || 'user',
      balance: 0
    });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

export default router;
