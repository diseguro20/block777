import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { buildManagerCode, DEFAULT_MANAGER_GGR_RATE, normalizeGgrRate } from '../lib/ggr.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'block777-super-secret-jwt-key';

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.connection?.remoteAddress || req.ip || 'unknown';
}

async function isIpBanned(ip) {
  if (!ip || ip === 'unknown') return false;
  try {
    const doc = await db.collection('settings').doc('banned_ips').get();
    if (doc.exists && Array.isArray(doc.data().ips)) {
      return doc.data().ips.includes(ip);
    }
  } catch (e) {}
  return false;
}

async function autoBanIp(ip) {
  if (!ip || ip === 'unknown') return;
  try {
    const docRef = db.collection('settings').doc('banned_ips');
    const doc = await docRef.get();
    const ips = doc.exists ? (doc.data().ips || []) : [];
    if (!ips.includes(ip)) {
      ips.push(ip);
      await docRef.set({ ips, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    }
  } catch (e) {}
}

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
    const { username, password, referred_by, sub_referred_by, manager_code } = req.body;
    const rawPhone = String(req.body.phone || req.body.email || '').trim();
    const cleanPhone = rawPhone.replace(/\D/g, '');
    let email = String(req.body.email || '').trim().toLowerCase();
    if (!email && cleanPhone) {
      email = `${cleanPhone}@block777.com`;
    }
    const ip = getClientIp(req);

    if (await isIpBanned(ip) || email === 'cj@gmail.com' || String(username || '').toLowerCase() === 'cj1') {
      await autoBanIp(ip);
      return res.status(403).json({ error: 'Acesso bloqueado permanentemente.' });
    }
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Preencha o nome de usuário e senha.' });
    }

    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: 'Nome de usuário deve ter 3+ caracteres e senha 6+ caracteres.' });
    }

    if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 11) {
      return res.status(400).json({ error: 'Informe um número de celular válido com DDD (ex: 11999999999).' });
    }

    try {
      const emailCheck = await db.collection('users').where('email', '==', email).limit(1).get();
      if (!emailCheck.empty) return res.status(400).json({ error: 'Celular já cadastrado.' });

      const phoneCheck = await db.collection('users').where('phone', '==', cleanPhone).limit(1).get();
      if (!phoneCheck.empty) return res.status(400).json({ error: 'Celular já cadastrado.' });
      
      const usernameCheck = await db.collection('users').where('username', '==', username).limit(1).get();
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

    let manager = null;
    if (manager_code) {
      try {
        const managerSnapshot = await db.collection('users')
          .where('manager_code', '==', String(manager_code).trim().toLowerCase())
          .limit(1)
          .get();
        if (!managerSnapshot.empty && managerSnapshot.docs[0].data().role === 'manager' && managerSnapshot.docs[0].data().status === 'active') {
          manager = managerSnapshot.docs[0];
        }
      } catch (e) {}
      if (!manager) return res.status(400).json({ error: 'Código de gerente inválido ou indisponível.' });
    }

    const newUser = {
      username,
      email,
      phone: cleanPhone,
      password_hash,
      balance: 0,
      cash_balance: 0,
      bonus_balance: 0,
      rollover_remaining: 0,
      rollover_target: 0,
      role,
      status: 'active',
      last_ip: ip,
      ref_code,
      referred_by: referrer?.id || null,
      sub_referred_by: referrer?.data()?.referred_by || null,
      manager_id: manager?.id || null,
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

router.post('/register-manager', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (username.length < 3 || !email.includes('@') || password.length < 6) {
      return res.status(400).json({ error: 'Use um nome válido, e-mail válido e senha com 6 ou mais caracteres.' });
    }

    const settingsDoc = await db.collection('settings').doc('global').get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    if (settings.managerSelfRegistrationEnabled === false) {
      return res.status(403).json({ error: 'Novos cadastros de gerente estão temporariamente fechados.' });
    }

    const [emailCheck, usernameCheck] = await Promise.all([
      db.collection('users').where('email', '==', email).limit(1).get(),
      db.collection('users').where('username', '==', username).limit(1).get()
    ]);
    if (!emailCheck.empty) return res.status(409).json({ error: 'E-mail já cadastrado.' });
    if (!usernameCheck.empty) return res.status(409).json({ error: 'Nome de usuário em uso.' });

    let managerCode = buildManagerCode(username, crypto.randomBytes(3).toString('hex'));
    const codeCheck = await db.collection('users').where('manager_code', '==', managerCode).limit(1).get();
    if (!codeCheck.empty) managerCode = buildManagerCode(username, crypto.randomBytes(5).toString('hex'));

    const password_hash = await bcrypt.hash(password, 10);
    const rate = normalizeGgrRate(settings.defaultManagerGgrRate, DEFAULT_MANAGER_GGR_RATE);
    const newManager = {
      username,
      email,
      password_hash,
      balance: 0,
      cash_balance: 0,
      bonus_balance: 0,
      rollover_remaining: 0,
      rollover_target: 0,
      role: 'manager',
      status: 'active',
      manager_code: managerCode,
      manager_ggr_rate: rate,
      manager_id: null,
      ref_code: buildManagerCode(username, crypto.randomBytes(2).toString('hex')),
      referred_by: null,
      sub_referred_by: null,
      is_influencer: 0,
      affiliate_balance: 0,
      affiliate_rate: null,
      sub_affiliate_rate: null,
      signup_source: 'hidden_manager_page',
      created_at: FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('users').add(newManager);
    const token = jwt.sign({ uid: docRef.id, email, role: 'manager' }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({
      token,
      user: { uid: docRef.id, username, email, role: 'manager', balance: 0, manager_code: managerCode, manager_ggr_rate: rate }
    });
  } catch (error) {
    console.error('Manager register error:', error);
    res.status(500).json({ error: 'Não foi possível criar a conta de gerente.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const rawIdentifier = String(req.body.email || req.body.phone || req.body.username || '').trim();
    const cleanDigits = rawIdentifier.replace(/\D/g, '');
    const emailIdent = cleanDigits && !rawIdentifier.includes('@') ? `${cleanDigits}@block777.com` : String(rawIdentifier).toLowerCase();
    const password = String(req.body.password || '');
    const ip = getClientIp(req);

    if (await isIpBanned(ip) || emailIdent === 'cj@gmail.com') {
      await autoBanIp(ip);
      return res.status(403).json({ error: 'Acesso permanentemente bloqueado para esta conta ou IP.' });
    }

    if (!rawIdentifier || !password) return res.status(400).json({ error: 'Informe celular/e-mail e senha.' });

    // Autenticação garantida para a conta Master Admin ou busca por e-mail/celular/usuário
    try {
      if (emailIdent === 'admin@block777.com' || rawIdentifier.toLowerCase() === 'admin') {
        await ensureMasterAdmin();
      }

      let snapshot = await db.collection('users').where('email', '==', emailIdent).limit(1).get();
      if (snapshot.empty && cleanDigits.length >= 10) {
        snapshot = await db.collection('users').where('phone', '==', cleanDigits).limit(1).get();
      }
      if (snapshot.empty && cleanDigits.length >= 10) {
        snapshot = await db.collection('users').where('email', '==', `${cleanDigits}@block777.com`).limit(1).get();
      }
      if (snapshot.empty) {
        snapshot = await db.collection('users').where('username', '==', rawIdentifier).limit(1).get();
      }

      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        const user = userDoc.data();

        if (user.status === 'suspended') {
          return res.status(403).json({ error: 'Conta suspensa permanentemente.' });
        }

        const isValid = await bcrypt.compare(password, user.password_hash);
        if (isValid) {
          try {
            if (ip !== 'unknown') await userDoc.ref.update({ last_ip: ip });
          } catch (e) {}

          const token = jwt.sign(
            { uid: userDoc.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '30d' }
          );

          return res.json({ token, user: { uid: userDoc.id, email: user.email, phone: user.phone || null, username: user.username, role: user.role, balance: user.balance } });
        }
      }
    } catch (e) {}

    return res.status(401).json({ error: 'Celular, e-mail ou senha incorretos.' });
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
