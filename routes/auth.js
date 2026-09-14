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
import { updateAdminSummary } from '../lib/adminSummary.js';
import { createPasswordResetCode, hashPasswordResetCode, isPasswordResetExpired, maskResetContact, PASSWORD_RESET_MAX_ATTEMPTS, passwordResetExpiry, safeCodeMatch } from '../lib/passwordReset.js';
import { buildRegistrationAttribution } from '../lib/attribution.js';

const router = express.Router();
const JWT_SECRET = getJwtSecret();
const ATTRIBUTION_COOKIE = 'blockerino_attribution';
const ATTRIBUTION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const cleanAttributionCode = value => String(value || '').trim().toLowerCase().slice(0, 100);
const readCookie = (req, name) => String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`))?.slice(name.length + 1) || '';
const readAttributionCookie = (req, tenantId) => {
  try {
    const token = decodeURIComponent(readCookie(req, ATTRIBUTION_COOKIE));
    if (!token) return {};
    const payload = jwt.verify(token, JWT_SECRET, { audience: 'blockerino-attribution' });
    if (payload.tenant_id !== tenantId) return {};
    return { refCode: cleanAttributionCode(payload.ref), managerCode: cleanAttributionCode(payload.manager) };
  } catch (_) { return {}; }
};
const attributionCookieHeader = token => `${ATTRIBUTION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${ATTRIBUTION_MAX_AGE_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
const clearAttributionCookie = res => res.setHeader('Set-Cookie', `${ATTRIBUTION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);

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

router.post('/capture-attribution', (req, res) => {
  const tenantId = req.tenant?.id || DEFAULT_TENANT_ID;
  const refCode = cleanAttributionCode(req.body?.ref);
  const managerCode = cleanAttributionCode(req.body?.manager);
  if (!refCode && !managerCode) {
    clearAttributionCookie(res);
    return res.json({ success: true, captured: false });
  }
  const token = jwt.sign({ ref: refCode || null, manager: managerCode || null, tenant_id: tenantId }, JWT_SECRET, { expiresIn: ATTRIBUTION_MAX_AGE_SECONDS, audience: 'blockerino-attribution' });
  res.setHeader('Set-Cookie', attributionCookieHeader(token));
  res.json({ success: true, captured: true });
});

router.get('/referral', async (req, res) => {
  const tenantId = req.tenant?.id || DEFAULT_TENANT_ID;
  const refCode = cleanAttributionCode(req.query?.ref);
  if (!refCode) return res.status(400).send('Link de afiliado inválido.');
  try {
    const referrer = await findTenantUser('ref_code', refCode, tenantId);
    if (!referrer) return res.status(404).send('Link de afiliado não encontrado. Solicite um novo link ao afiliado.');
    const token = jwt.sign({ ref: refCode, manager: null, tenant_id: tenantId }, JWT_SECRET, { expiresIn: ATTRIBUTION_MAX_AGE_SECONDS, audience: 'blockerino-attribution' });
    res.set('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', attributionCookieHeader(token));
    const tenantQuery = tenantId === DEFAULT_TENANT_ID ? '' : `?tenant=${encodeURIComponent(tenantId)}`;
    return res.redirect(302, `/${tenantQuery}`);
  } catch (error) {
    console.error('Referral capture error:', error);
    return res.status(503).send('Não foi possível validar o link agora. Tente novamente.');
  }
});

router.post('/register', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || DEFAULT_TENANT_ID;
    const { username, password, referred_by, sub_referred_by, manager_code } = req.body;
    const cookieAttribution = readAttributionCookie(req, tenantId);
    const requestedReferralCode = cleanAttributionCode(referred_by || cookieAttribution.refCode);
    const requestedManagerCode = cleanAttributionCode(manager_code || cookieAttribution.managerCode);
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
    if (requestedReferralCode) {
      try {
        referrer = await findTenantUser('ref_code', requestedReferralCode, tenantId);
      } catch (e) {}
      if (!referrer) return res.status(400).json({ error: 'O link do afiliado não pôde ser validado. Abra novamente o link recebido.' });
    }

    let manager = null;
    if (requestedManagerCode) {
      try {
        const managerMatch = await findTenantUser('manager_code', requestedManagerCode, tenantId);
        if (managerMatch && managerMatch.data().role === 'manager' && managerMatch.data().status === 'active') {
          manager = managerMatch;
        }
      } catch (e) {}
      if (!manager) return res.status(400).json({ error: 'Código de gerente inválido ou indisponível.' });
    }

    const referrerData = referrer?.data?.() || {};
    const managerData = manager?.data?.() || {};
    const attribution = buildRegistrationAttribution({ referrerId: referrer?.id, referrer: referrerData, managerId: manager?.id, manager: managerData });
    attribution.registered_at = FieldValue.serverTimestamp();
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
      sub_referred_by: referrerData.referred_by || null,
      manager_id: manager?.id || null,
      signup_ref_code: attribution.affiliate_code,
      signup_manager_code: attribution.manager_code,
      attribution,
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
    updateAdminSummary(null, tenantId, { totalUsers: 1 }).catch(error => {
      console.warn('Admin summary register update:', error.message);
    });
    persistTmpUser(newUser, docId);
    
    const token = jwt.sign(
      { uid: docId, email: newUser.email, role: newUser.role, tenant_id: tenantId },
      JWT_SECRET,
      { expiresIn: authTokenTtl(newUser.role) }
    );

    clearAttributionCookie(res);
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
    updateAdminSummary(null, tenantId, { totalUsers: 1 }).catch(error => {
      console.warn('Admin summary manager update:', error.message);
    });
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
    const rawIdentifier = String(req.body.identifier || req.body.email || req.body.phone || req.body.username || '').trim();
    const inputDigits = rawIdentifier.replace(/\D/g, '');
    const cleanDigits = inputDigits.startsWith('55') && [12, 13].includes(inputDigits.length)
      ? inputDigits.slice(2)
      : inputDigits;
    const isPhone = [10, 11].includes(cleanDigits.length) && !rawIdentifier.includes('@');
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
          const docKey = isPhone ? `${tenantId}_phone_${cleanDigits}` : (emailIdent.includes('@') ? `${tenantId}_email_${emailIdent}` : `${tenantId}_user_${rawIdentifier.toLowerCase()}`);
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

async function findPasswordResetUser(identifier, tenantId) {
  const raw = String(identifier || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!raw) return null;
  if (digits.length >= 10) {
    const byPhone = await findTenantUser('phone', digits, tenantId);
    if (byPhone) return byPhone;
  }
  if (raw.includes('@')) {
    const byEmail = await findTenantUser('email', raw.toLowerCase(), tenantId);
    if (byEmail) return byEmail;
  }
  return findTenantUser('username', raw, tenantId);
}

router.post('/password-reset/request', async (req, res) => {
  const tenantId = req.tenant?.id || DEFAULT_TENANT_ID;
  const identifier = String(req.body.identifier || '').trim();
  if (!identifier) return res.status(400).json({ error: 'Informe seu celular, e-mail ou nome de usuário.' });
  const requestRef = db.collection('password_reset_requests').doc();
  let responseRequestId = requestRef.id;
  try {
    const userDoc = await findPasswordResetUser(identifier, tenantId);
    if (userDoc && userDoc.data().status !== 'suspended') {
      const recent = await db.collection('password_reset_requests')
        .where('uid', '==', userDoc.id)
        .limit(10)
        .get();
      const recentRequest = recent.docs.find(doc => {
        const data = doc.data();
        const created = data.created_at?.toMillis?.() || new Date(data.created_at || 0).getTime();
        return belongsToTenant(data, tenantId)
          && data.status !== 'used'
          && Number.isFinite(created)
          && Date.now() - created < 60 * 1000;
      });
      if (recentRequest) {
        responseRequestId = recentRequest.id;
      } else {
        const user = userDoc.data();
        await requestRef.set({
          uid: userDoc.id,
          tenant_id: tenantId,
          username: user.username || '',
          contact: maskResetContact(user),
          status: 'pending',
          attempts: 0,
          expires_at: passwordResetExpiry(),
          created_at: FieldValue.serverTimestamp()
        });
      }
    }
  } catch (error) {
    console.warn('Password reset request info:', error.message);
  }
  res.json({
    success: true,
    requestId: responseRequestId,
    message: 'Se a conta existir, a solicitação aparecerá para o administrador. Peça o código temporário e informe-o nesta tela.'
  });
});

router.post('/password-reset/confirm', async (req, res) => {
  try {
    const tenantId = req.tenant?.id || DEFAULT_TENANT_ID;
    const requestId = String(req.body.requestId || '').trim();
    const code = String(req.body.code || '').replace(/\D/g, '');
    const newPassword = String(req.body.newPassword || '');
    if (!requestId || code.length !== 6 || newPassword.length < 8) {
      return res.status(400).json({ error: 'Informe a solicitação, o código de 6 dígitos e uma senha com pelo menos 8 caracteres.' });
    }
    const password_hash = await bcrypt.hash(newPassword, 12);
    const requestRef = db.collection('password_reset_requests').doc(requestId);
    const preflight = await requestRef.get();
    const reset = preflight.exists ? preflight.data() : null;
    const receivedHash = hashPasswordResetCode(requestId, code, JWT_SECRET);
    if (!reset || !belongsToTenant(reset, tenantId) || reset.status !== 'issued' || isPasswordResetExpired(reset.expires_at) || !safeCodeMatch(reset.code_hash, receivedHash)) {
      if (reset && belongsToTenant(reset, tenantId) && reset.status === 'issued') {
        await requestRef.update({ attempts: FieldValue.increment(1), last_attempt_at: FieldValue.serverTimestamp() }).catch(() => {});
      }
      return res.status(400).json({ error: 'Código inválido ou expirado.' });
    }
    await db.runTransaction(async transaction => {
      const requestDoc = await transaction.get(requestRef);
      if (!requestDoc.exists) throw new Error('Código inválido ou expirado.');
      const reset = requestDoc.data();
      if (!belongsToTenant(reset, tenantId) || reset.status !== 'issued' || isPasswordResetExpired(reset.expires_at)) {
        throw new Error('Código inválido ou expirado.');
      }
      if ((Number(reset.attempts) || 0) >= PASSWORD_RESET_MAX_ATTEMPTS) throw new Error('Código bloqueado por excesso de tentativas.');
      if (!safeCodeMatch(reset.code_hash, receivedHash)) {
        throw new Error('Código inválido ou expirado.');
      }
      const userRef = db.collection('users').doc(reset.uid);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists || !belongsToTenant(userDoc.data(), tenantId)) throw new Error('Conta não encontrada.');
      transaction.update(userRef, { password_hash, password_updated_at: FieldValue.serverTimestamp() });
      transaction.update(requestRef, { status: 'used', used_at: FieldValue.serverTimestamp(), code_hash: null });
    });
    const refreshedUser = await db.collection('users').doc(reset.uid).get();
    if (refreshedUser.exists) cacheUser(refreshedUser.data(), refreshedUser.id);
    res.json({ success: true, message: 'Senha alterada. Entre novamente com a nova senha.' });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível redefinir a senha.' });
  }
});

router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (!currentPassword || newPassword.length < 8) return res.status(400).json({ error: 'Informe a senha atual e uma nova senha com pelo menos 8 caracteres.' });
    const userRef = db.collection('users').doc(req.user.uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists || !belongsToTenant(userDoc.data(), req.user.tenant_id || req.tenant?.id || DEFAULT_TENANT_ID)) return res.status(404).json({ error: 'Conta não encontrada.' });
    if (!await bcrypt.compare(currentPassword, userDoc.data().password_hash)) return res.status(401).json({ error: 'Senha atual incorreta.' });
    const password_hash = await bcrypt.hash(newPassword, 12);
    await userRef.update({ password_hash, password_updated_at: FieldValue.serverTimestamp() });
    cacheUser({ ...userDoc.data(), password_hash }, userDoc.id);
    res.json({ success: true, message: 'Senha alterada com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível alterar a senha.' });
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
