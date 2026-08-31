import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { buildManagerCode, DEFAULT_MANAGER_GGR_RATE, normalizeGgrRate } from '../lib/ggr.js';
import { authTokenTtl, getJwtSecret } from '../lib/security.js';
import { DEFAULT_TENANT_ID, belongsToTenant, tenantBannedIpsId, tenantSettingsRef } from '../lib/tenant.js';
import { findTenantUser } from '../lib/userLookup.js';

const router = express.Router();
const JWT_SECRET = getJwtSecret();

// Cache somente em memória. Senhas e perfis nunca são gravados em arquivos temporários.
const resilientUserRegistry = new Map();
const BANNED_IP_CACHE_TTL_MS = 5 * 60 * 1000;
let bannedIpCache = { ips: [], loadedAt: 0 };

function cacheUser(user, id) {
  if (!user) return;
  const uid = id || user.id || user.uid || 'user_' + Date.now();
  const userData = { ...user, uid, id: uid };
  const tenantId = user.tenant_id || DEFAULT_TENANT_ID;
  const key = value => `${tenantId}:${String(value).toLowerCase().trim()}`;
  if (user.email) resilientUserRegistry.set(key(user.email), userData);
  if (user.phone) {
    resilientUserRegistry.set(key(user.phone), userData);
    resilientUserRegistry.set(key(`${String(user.phone).trim()}@block777.com`), userData);
  }
  if (user.username) resilientUserRegistry.set(key(user.username), userData);
  if (user.manager_code) resilientUserRegistry.set(key(user.manager_code), userData);
}

function loadTmpUsers() {
  return;
}

function persistTmpUser(user, id) {
  cacheUser(user, id);
}

function findCachedUser(identifier, cleanDigits, tenantId = DEFAULT_TENANT_ID) {
  loadTmpUsers();
  if (!identifier) return null;
  const lower = `${tenantId}:${String(identifier).toLowerCase().trim()}`;
  if (resilientUserRegistry.has(lower)) return resilientUserRegistry.get(lower);
  if (cleanDigits && resilientUserRegistry.has(`${tenantId}:${cleanDigits}`)) return resilientUserRegistry.get(`${tenantId}:${cleanDigits}`);
  if (cleanDigits && resilientUserRegistry.has(`${tenantId}:${cleanDigits}@block777.com`)) return resilientUserRegistry.get(`${tenantId}:${cleanDigits}@block777.com`);
  return null;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.connection?.remoteAddress || req.ip || 'unknown';
}

async function isIpBanned(ip, tenantId = DEFAULT_TENANT_ID) {
  if (!ip || ip === 'unknown') return false;
  if (bannedIpCache.tenantId === tenantId && Date.now() - bannedIpCache.loadedAt < BANNED_IP_CACHE_TTL_MS) {
    return bannedIpCache.ips.includes(ip);
  }
  try {
    const doc = await db.collection('settings').doc(tenantBannedIpsId(tenantId)).get();
    const ips = doc.exists && Array.isArray(doc.data().ips) ? doc.data().ips : [];
    bannedIpCache = { ips, tenantId, loadedAt: Date.now() };
    return ips.includes(ip);
  } catch (e) {
    return bannedIpCache.ips.includes(ip);
  }
}

async function autoBanIp(ip, tenantId = DEFAULT_TENANT_ID) {
  if (!ip || ip === 'unknown') return;
  try {
    const docRef = db.collection('settings').doc(tenantBannedIpsId(tenantId));
    const doc = await docRef.get();
    const ips = doc.exists ? (doc.data().ips || []) : [];
    if (!ips.includes(ip)) {
      ips.push(ip);
      await docRef.set({ ips, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    }
    bannedIpCache = { ips, tenantId, loadedAt: Date.now() };
  } catch (e) {}
}

router.post('/register', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || DEFAULT_TENANT_ID;
    const { username, password, referred_by, sub_referred_by, manager_code } = req.body;
    const rawPhone = String(req.body.phone || req.body.email || '').trim();
    const cleanPhone = rawPhone.replace(/\D/g, '');
    let email = String(req.body.email || '').trim().toLowerCase();
    if (!email && cleanPhone) {
      email = `${cleanPhone}@block777.com`;
    }
    const ip = getClientIp(req);

    if (await isIpBanned(ip, tenantId) || email === 'cj@gmail.com' || String(username || '').toLowerCase() === 'cj1') {
      await autoBanIp(ip, tenantId);
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
      const [phoneDoc, legacyPhoneDoc, usernameCheck] = await Promise.all([
        db.collection('users').doc(`${tenantId}_phone_${cleanPhone}`).get(),
        tenantId === DEFAULT_TENANT_ID ? db.collection('users').doc(`phone_${cleanPhone}`).get() : Promise.resolve({ exists: false }),
        findTenantUser('username', username, tenantId)
      ]);
      if (phoneDoc.exists || legacyPhoneDoc.exists) return res.status(400).json({ error: 'Celular já cadastrado.' });
      if (usernameCheck) return res.status(400).json({ error: 'Nome de usuário em uso.' });
    } catch (e) {}

    const password_hash = await bcrypt.hash(password, 10);
    const randomChars = crypto.randomBytes(2).toString('hex');
    const ref_code = `${username}${randomChars}`.toLowerCase();

    const role = 'user';

    let referrer = null;
    if (referred_by) {
      try {
        referrer = await findTenantUser('ref_code', String(referred_by).toLowerCase(), tenantId);
      } catch (e) {}
    }

    let manager = null;
    if (manager_code) {
      try {
        const managerMatch = await findTenantUser('manager_code', String(manager_code).trim().toLowerCase(), tenantId);
        if (managerMatch && managerMatch.data().role === 'manager' && managerMatch.data().status === 'active') {
          manager = managerMatch;
        }
      } catch (e) {}
      if (!manager) return res.status(400).json({ error: 'Código de gerente inválido ou indisponível.' });
    }

    const newUser = {
      username,
      tenant_id: tenantId,
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

    let docId = cleanPhone ? `${tenantId}_phone_${cleanPhone}` : (email ? `${tenantId}_email_${email}` : `${tenantId}_user_${Date.now()}`);
    let savedInFirestore = false;
    try {
      await db.collection('users').doc(docId).set(newUser);
      savedInFirestore = true;
    } catch (e) {
      try {
        const docRef = await db.collection('users').add(newUser);
        docId = docRef.id;
        savedInFirestore = true;
      } catch (e2) {
        console.error('Firestore register write error:', e2.message);
      }
    }

    if (!savedInFirestore) {
      return res.status(503).json({ error: 'O cadastro está temporariamente indisponível. Nenhuma conta foi criada; tente novamente em alguns minutos.' });
    }
    persistTmpUser(newUser, docId);
    
    const token = jwt.sign(
      { uid: docId, email: newUser.email, role: newUser.role, tenant_id: tenantId },
      JWT_SECRET,
      { expiresIn: authTokenTtl(newUser.role) }
    );

    res.status(201).json({ token, user: { uid: docId, username, email, role, tenant_id: tenantId, balance: newUser.balance } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

router.post('/register-manager', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || DEFAULT_TENANT_ID;
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (username.length < 3 || !email.includes('@') || password.length < 6) {
      return res.status(400).json({ error: 'Use um nome válido, e-mail válido e senha com 6 ou mais caracteres.' });
    }

    let settings = {};
    try {
      const settingsDoc = await tenantSettingsRef(tenantId).get();
      if (settingsDoc.exists) settings = settingsDoc.data();
    } catch (e) {}

    if (settings.managerSelfRegistrationEnabled === false) {
      return res.status(403).json({ error: 'Novos cadastros de gerente estão temporariamente fechados.' });
    }

    try {
      const [emailCheck, usernameCheck] = await Promise.all([
        findTenantUser('email', email, tenantId),
        findTenantUser('username', username, tenantId)
      ]);
      if (emailCheck) return res.status(409).json({ error: 'E-mail já cadastrado.' });
      if (usernameCheck) return res.status(409).json({ error: 'Nome de usuário em uso.' });
    } catch (e) {}

    let managerCode = buildManagerCode(username, crypto.randomBytes(3).toString('hex'));
    try {
      const codeCheck = await findTenantUser('manager_code', managerCode, tenantId);
      if (codeCheck) managerCode = buildManagerCode(username, crypto.randomBytes(5).toString('hex'));
    } catch (e) {}

    const password_hash = await bcrypt.hash(password, 10);
    const rate = normalizeGgrRate(settings.defaultManagerGgrRate, DEFAULT_MANAGER_GGR_RATE);
    const newManager = {
      username,
      tenant_id: tenantId,
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

    let docId = `${tenantId}_email_${email}`;
    let savedInFirestore = false;
    try {
      await db.collection('users').doc(docId).set(newManager);
      savedInFirestore = true;
    } catch (e) {
      try {
        const docRef = await db.collection('users').add(newManager);
        docId = docRef.id;
        savedInFirestore = true;
      } catch (e2) {
        console.error('Firestore manager register write error:', e2.message);
      }
    }

    if (!savedInFirestore) {
      return res.status(503).json({ error: 'O cadastro de gerente está temporariamente indisponível. Nenhuma conta foi criada; tente novamente mais tarde.' });
    }
    persistTmpUser(newManager, docId);

    const token = jwt.sign({ uid: docId, email, role: 'manager', tenant_id: tenantId }, JWT_SECRET, { expiresIn: authTokenTtl('manager') });
    res.status(201).json({
      token,
      user: { uid: docId, username, email, role: 'manager', tenant_id: tenantId, balance: 0, manager_code: managerCode, manager_ggr_rate: rate }
    });
  } catch (error) {
    console.error('Manager register error:', error);
    res.status(500).json({ error: 'Não foi possível criar a conta de gerente.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || DEFAULT_TENANT_ID;
    const rawIdentifier = String(req.body.email || req.body.phone || req.body.username || '').trim();
    const cleanDigits = rawIdentifier.replace(/\D/g, '');
    const isPhone = cleanDigits.length >= 10 && !rawIdentifier.includes('@');
    const emailIdent = isPhone ? `${cleanDigits}@block777.com` : String(rawIdentifier).toLowerCase();
    const password = String(req.body.password || '');
    const ip = getClientIp(req);

    if (!rawIdentifier || !password) return res.status(400).json({ error: 'Informe celular/e-mail e senha.' });

    if (await isIpBanned(ip, tenantId) || emailIdent === 'cj@gmail.com') {
      await autoBanIp(ip, tenantId);
      return res.status(403).json({ error: 'Acesso permanentemente bloqueado para esta conta ou IP.' });
    }

    let user = null;
    let userId = null;

    // 1. Verificação instantânea em cache de memória (0ms de latência)
    user = findCachedUser(rawIdentifier, cleanDigits, tenantId) || findCachedUser(emailIdent, cleanDigits, tenantId);
    if (user && !belongsToTenant(user, tenantId)) { user = null; userId = null; }
    if (user) userId = user.id || user.uid;

    // 2. Se não estiver no cache da instância, busca no Firestore com proteção de tempo limite
    if (!user) {
      try {
        const lookupPromise = (async () => {
          const docKey = cleanDigits.length >= 10 ? `${tenantId}_phone_${cleanDigits}` : (emailIdent.includes('@') ? `${tenantId}_email_${emailIdent}` : `${tenantId}_user_${rawIdentifier.toLowerCase()}`);
          try {
            const docSnap = await db.collection('users').doc(docKey).get();
            if (docSnap.exists) return { user: docSnap.data(), id: docSnap.id };
          } catch (e) {}

          try {
            const match = await findTenantUser('email', emailIdent, tenantId);
            if (match) return { user: match.data(), id: match.id };
          } catch (e) {}
          if (tenantId === DEFAULT_TENANT_ID) {
            try {
              const legacy = await db.collection('users').where('email', '==', emailIdent).limit(5).get();
              const match = legacy.docs.find(doc => belongsToTenant(doc.data(), tenantId));
              if (match) return { user: match.data(), id: match.id };
            } catch (e) {}
          }

          if (cleanDigits.length >= 10) {
            try {
              const match = await findTenantUser('phone', cleanDigits, tenantId);
              if (match) return { user: match.data(), id: match.id };
            } catch (e) {}
            if (tenantId === DEFAULT_TENANT_ID) {
              try {
                const legacyPhone = await db.collection('users').where('phone', '==', cleanDigits).limit(5).get();
                const match = legacyPhone.docs.find(doc => belongsToTenant(doc.data(), tenantId));
                if (match) return { user: match.data(), id: match.id };
              } catch (e) {}
            }
          }
          return null;
        })();

        const result = await Promise.race([
          lookupPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);

        if (result) {
          user = result.user;
          userId = result.id;
          cacheUser(user, userId);
        }
      } catch (e) {}
    }

    if (user) {
      if (user.status === 'suspended') {
        return res.status(403).json({ error: 'Conta suspensa permanentemente.' });
      }

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (isValid) {
        const role = user.role;
        try {
          if (ip !== 'unknown' && userId) {
            await db.collection('users').doc(userId).update({ last_ip: ip });
          }
        } catch (e) {}

        const token = jwt.sign(
          { uid: userId, email: user.email, role, tenant_id: user.tenant_id || tenantId },
          JWT_SECRET,
          { expiresIn: authTokenTtl(role) }
        );

        return res.json({
          token,
          user: {
            uid: userId,
            email: user.email,
            phone: user.phone || null,
            username: user.username,
            role,
            tenant_id: user.tenant_id || tenantId,
            balance: user.balance || 0
          }
        });
      }
    }

    return res.status(401).json({ error: 'Celular, e-mail ou senha incorretos.' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    try {
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      if (userDoc.exists && belongsToTenant(userDoc.data(), req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID)) {
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
      tenant_id: req.user.tenant_id || DEFAULT_TENANT_ID,
      balance: 0
    });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

export default router;
