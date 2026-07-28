import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Garante que exista uma conta de administrador master no sistema
async function ensureMasterAdmin() {
  try {
    const adminEmail = 'admin@block777.com';
    const snapshot = await db.collection('users').where('email', '==', adminEmail).limit(1).get();
    if (snapshot.empty) {
      const password_hash = await bcrypt.hash('admin777', 10);
      const adminUser = {
        username: 'admin',
        email: adminEmail,
        password_hash,
        balance: 100000, // R$ 1.000,00
        role: 'admin',
        status: 'active',
        ref_code: 'admin777',
        referred_by: null,
        sub_referred_by: null,
        is_influencer: 1,
        affiliate_balance: 0,
        created_at: FieldValue.serverTimestamp()
      };
      await db.collection('users').add(adminUser);
      console.log('👑 Conta Admin Master (admin@block777.com / admin777) criada com sucesso!');
    }
  } catch (e) {
    console.error('Erro ao verificar conta master admin:', e);
  }
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, referred_by, sub_referred_by } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }

    const emailCheck = await db.collection('users').where('email', '==', email).get();
    if (!emailCheck.empty) return res.status(400).json({ error: 'Email already registered' });
    
    const usernameCheck = await db.collection('users').where('username', '==', username).get();
    if (!usernameCheck.empty) return res.status(400).json({ error: 'Username already taken' });

    const password_hash = await bcrypt.hash(password, 10);
    const randomChars = crypto.randomBytes(2).toString('hex');
    const ref_code = `${username}${randomChars}`.toLowerCase();

    // Se o e-mail ou nome for admin, atribui role de admin
    const role = (email.toLowerCase().includes('admin') || username.toLowerCase() === 'admin') ? 'admin' : 'user';

    let referrerId = null;
    let subReferrerId = null;

    if (referred_by) {
      const refDoc = await db.collection('users').where('ref_code', '==', referred_by).get();
      if (!refDoc.empty) {
        referrerId = refDoc.docs[0].id;
        const refData = refDoc.docs[0].data();
        if (refData.referred_by) {
          subReferrerId = refData.referred_by;
        }
      }
    }
    
    if (sub_referred_by && !subReferrerId) {
      const subRefDoc = await db.collection('users').where('ref_code', '==', sub_referred_by).get();
      if (!subRefDoc.empty) subReferrerId = subRefDoc.docs[0].id;
    }

    const newUser = {
      username,
      email,
      password_hash,
      balance: role === 'admin' ? 100000 : 0,
      role,
      status: 'active',
      ref_code,
      referred_by: referrerId,
      sub_referred_by: subReferrerId,
      is_influencer: role === 'admin' ? 1 : 0,
      affiliate_balance: 0,
      affiliate_rate: null,
      sub_affiliate_rate: null,
      created_at: FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('users').add(newUser);
    
    const token = jwt.sign(
      { uid: docRef.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { uid: docRef.id, username, email, role, balance: newUser.balance } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    // Garante criacao do admin master se for a conta padrao
    if (email.toLowerCase() === 'admin@block777.com' && password === 'admin777') {
      await ensureMasterAdmin();
    }

    const snapshot = await db.collection('users').where('email', '==', email).limit(1).get();
    if (snapshot.empty) return res.status(401).json({ error: 'Credenciais inválidas' });

    const userDoc = snapshot.docs[0];
    const user = userDoc.data();

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Conta suspensa' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign(
      { uid: userDoc.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { uid: userDoc.id, email: user.email, username: user.username, role: user.role, balance: user.balance } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });

    const userData = userDoc.data();
    delete userData.password_hash;
    
    res.json({ uid: userDoc.id, ...userData });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
