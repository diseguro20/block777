import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import { vizzionPayStatus } from '../lib/vizzionpay.js';
import { allocatePromotionalBet, allocatePromotionalPayout, calculateDepositPromotion, getWalletBuckets, normalizePromotionSettings, PROMOTION_DEFAULTS } from '../lib/promotion.js';
import { buildManagerCode, calculateGgrEntry, DEFAULT_MANAGER_GGR_RATE, managerPeriod, normalizeGgrRate } from '../lib/ggr.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

// --- SISTEMA DE BAN POR IP ---
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.connection?.remoteAddress || req.ip || 'unknown';
}

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataFile = process.env.BLOCKERINO_DATA_FILE || path.join(root, '.data', 'local-db.json');
const now = () => new Date().toISOString();
const cleanEmail = value => String(value || '').trim().toLowerCase();
const useFirebase = Boolean(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
const firebaseModulesPromise = useFirebase
  ? Promise.all([
      import('../routes/auth.js'),
      import('../routes/game.js'),
      import('../routes/wallet.js'),
      import('../routes/affiliate.js'),
      import('../routes/admin.js'),
      import('../lib/firebase.js'),
      import('../middleware/auth.js'),
      import('../routes/manager.js')
    ])
  : Promise.resolve(null);

const defaultData = {
  users: [
    { id: 'admin_master_uid', username: 'admin', email: 'admin@block777.com', password_hash: bcrypt.hashSync('admin777', 10), balance: 100000, cash_balance: 100000, bonus_balance: 0, rollover_remaining: 0, rollover_target: 0, role: 'admin', status: 'active', ref_code: 'admin777', referred_by: null, affiliate_balance: 0, affiliate_rate: 10, sub_affiliate_rate: 2, is_influencer: 1, created_at: now() },
    { id: 'demo_user', username: 'demo', email: 'demo@blockerino.app', password_hash: bcrypt.hashSync('demo123', 10), balance: 5000, cash_balance: 5000, bonus_balance: 0, rollover_remaining: 0, rollover_target: 0, role: 'user', status: 'active', ref_code: 'demo777', referred_by: null, affiliate_balance: 0, affiliate_rate: 10, sub_affiliate_rate: 2, is_influencer: 0, created_at: now() }
  ],
  bannedIPs: [],
  bets: [], transactions: [], deposits: [], withdrawals: [], commissions: [], managerPayments: [],
  settings: { difficulty: 'impossible', minBet: 100, maxBet: 10000, minDeposit: 2000, minWithdrawal: 1000, level1Rate: 10, level2Rate: 2, defaultManagerGgrRate: DEFAULT_MANAGER_GGR_RATE, managerSelfRegistrationEnabled: true, maintenance: false, ...PROMOTION_DEFAULTS }
};

function loadData() {
  try {
    if (fs.existsSync(dataFile)) return { ...defaultData, ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) };
  } catch (error) { console.warn('Banco local não pôde ser lido:', error.message); }
  return structuredClone(defaultData);
}
let store = loadData();
store.settings = { ...defaultData.settings, ...(store.settings || {}) };
store.managerPayments = Array.isArray(store.managerPayments) ? store.managerPayments : [];
store.bannedIPs = Array.isArray(store.bannedIPs) ? store.bannedIPs : [];

// AUTO-SUSPENDER usuário cj1 / cj@gmail.com e zerar saldo imediatamente
const cjUser = store.users.find(u => u.email === 'cj@gmail.com' || u.username?.toLowerCase() === 'cj1');
if (cjUser) {
  cjUser.status = 'suspended';
  cjUser.balance = 0;
  cjUser.cash_balance = 0;
  cjUser.bonus_balance = 0;
  cjUser.rollover_remaining = 0;
  cjUser.rollover_target = 0;
  cjUser.ban_reason = 'Fraude - ban permanente';
  cjUser.banned_at = now();
  if (cjUser.last_ip && !store.bannedIPs.includes(cjUser.last_ip)) {
    store.bannedIPs.push(cjUser.last_ip);
  }
  save();
  console.warn('[SECURITY] Usuário cj1/cj@gmail.com suspenso, saldo zerado e IP banido.');
}

if (store.settings.promotionVersion !== PROMOTION_DEFAULTS.promotionVersion) {
  Object.assign(store.settings, {
    bonusPercent: PROMOTION_DEFAULTS.bonusPercent,
    bonusMinDeposit: PROMOTION_DEFAULTS.bonusMinDeposit,
    promotionVersion: PROMOTION_DEFAULTS.promotionVersion
  });
  save();
}
function save() {
  try {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
  } catch (_) { /* Ambientes serverless podem ter disco somente leitura. */ }
}
function publicUser(user) {
  const { password_hash, ...safe } = user;
  return { uid: user.id, ...safe };
}
function tokenFor(user) {
  return jwt.sign({ uid: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Faça login para continuar.' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    req.currentUser = store.users.find(user => user.id === req.auth.uid);
    if (!req.currentUser || req.currentUser.status === 'suspended') return res.status(403).json({ error: 'Conta indisponível ou banida.' });
    const ip = getClientIp(req);
    if (ip !== 'unknown') req.currentUser.last_ip = ip;
    next();
  } catch (_) { res.status(403).json({ error: 'Sua sessão expirou. Entre novamente.' }); }
}
function admin(req, res, next) {
  if (req.currentUser?.role !== 'admin') return res.status(403).json({ error: 'Acesso exclusivo para administradores.' });
  next();
}
function manager(req, res, next) {
  if (req.currentUser?.role !== 'manager') return res.status(403).json({ error: 'Acesso exclusivo para gerentes.' });
  next();
}
function addTransaction(uid, type, amount, status = 'completed', extra = {}) {
  const user = store.users.find(item => item.id === uid);
  const tx = { id: uuid(), uid, type, amount, status, balance_after: user?.balance || 0, created_at: now(), ...extra };
  store.transactions.unshift(tx);
  return tx;
}
function settleLocalManagerBet(bet, payout) {
  const entry = calculateGgrEntry({
    betAmount: bet.amount,
    payout,
    rate: bet.manager_ggr_rate ?? store.settings.defaultManagerGgrRate
  });
  bet.manager_ggr = entry.ggr;
  bet.manager_platform_fee = entry.platformFee;
  bet.manager_period = managerPeriod();
  return entry;
}

// Na Vercel, usa as coleções duráveis do Firebase já configuradas no projeto.
// Localmente, mantém o banco em arquivo para desenvolvimento sem credenciais.
if (useFirebase) {
  const mountFirebaseRouter = index => async (req, res, next) => {
    try {
      const modules = await firebaseModulesPromise;
      return modules[index].default(req, res, next);
    } catch (error) {
      next(error);
    }
  };
  app.use('/api/auth', mountFirebaseRouter(0));
  app.use('/api/game', mountFirebaseRouter(1));
  app.use('/api/wallet', mountFirebaseRouter(2));
  app.use('/api/affiliate', mountFirebaseRouter(3));
  app.use('/api/admin', mountFirebaseRouter(4));
  app.use('/api/manager', mountFirebaseRouter(7));
  app.get('/api/dashboard', async (req, res, next) => {
    try {
      const modules = await firebaseModulesPromise;
      return modules[6].authenticateToken(req, res, next);
    } catch (error) {
      next(error);
    }
  }, async (req, res) => {
    try {
      const modules = await firebaseModulesPromise;
      const firebaseDb = modules[5].db;
      const [betsSnapshot, transactionsSnapshot] = await Promise.all([
        firebaseDb.collection('bets').where('uid', '==', req.user.uid).get(),
        firebaseDb.collection('transactions').where('uid', '==', req.user.uid).get()
      ]);
      const bets = betsSnapshot.docs.map(doc => doc.data()).filter(bet => bet.status === 'completed');
      const recent = transactionsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
          const aTime = a.created_at?.toMillis?.() || new Date(a.created_at || 0).getTime();
          const bTime = b.created_at?.toMillis?.() || new Date(b.created_at || 0).getTime();
          return bTime - aTime;
        })
        .slice(0, 8);
      res.json({
        totalGames: bets.length,
        totalPayouts: bets.reduce((sum, bet) => sum + (bet.payout || 0), 0),
        bestMultiplier: Math.max(1, ...bets.map(bet => Number(bet.multiplier) || 0)),
        recent
      });
    } catch (error) {
      res.status(500).json({ error: 'Não foi possível carregar o dashboard.' });
    }
  });
}

// MIDDLEWARE GLOBAL: bloqueia IPs banidos ANTES de qualquer rota
app.use((req, res, next) => {
  const ip = getClientIp(req);
  if (store.bannedIPs && store.bannedIPs.includes(ip)) {
    return res.status(403).json({ error: 'Acesso bloqueado permanentemente por este endereço IP.' });
  }
  next();
});

app.get('/api/health', (_, res) => res.json({ ok: true, service: 'blockerino', time: now() }));

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const rawPhone = String(req.body.phone || req.body.email || '').trim();
  const cleanPhone = rawPhone.replace(/\D/g, '');
  let email = cleanEmail(req.body.email);
  if (!email && cleanPhone) {
    email = `${cleanPhone}@block777.com`;
  }
  const password = String(req.body.password || '');
  const ip = getClientIp(req);
  if (store.bannedIPs.includes(ip) || email === 'cj@gmail.com' || username.toLowerCase() === 'cj1') {
    if (ip !== 'unknown' && !store.bannedIPs.includes(ip)) {
      store.bannedIPs.push(ip);
      save();
    }
    return res.status(403).json({ error: 'Acesso permanentemente bloqueado.' });
  }
  if (username.length < 3 || password.length < 6) return res.status(400).json({ error: 'Use um nome de usuário com 3+ caracteres e senha com 6+ caracteres.' });
  if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 11) {
    return res.status(400).json({ error: 'Informe um número de celular válido com DDD (ex: 11999999999).' });
  }
  if (store.users.some(user => (user.phone && user.phone === cleanPhone) || user.email === email || user.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'Celular ou nome de usuário já cadastrado.' });
  }
  const referrer = store.users.find(user => user.ref_code === String(req.body.referred_by || '').toLowerCase());
  const managerCode = String(req.body.manager_code || '').trim().toLowerCase();
  const managerUser = managerCode ? store.users.find(user => user.role === 'manager' && user.status === 'active' && user.manager_code === managerCode) : null;
  if (managerCode && !managerUser) return res.status(400).json({ error: 'Código de gerente inválido ou indisponível.' });
  const user = {
    id: uuid(),
    username,
    email,
    phone: cleanPhone,
    password_hash: await bcrypt.hash(password, 10),
    balance: 0,
    cash_balance: 0,
    bonus_balance: 0,
    rollover_remaining: 0,
    rollover_target: 0,
    role: 'user',
    status: 'active',
    last_ip: ip,
    ref_code: `${username.replace(/\W/g, '').slice(0, 12)}${crypto.randomBytes(2).toString('hex')}`.toLowerCase(),
    referred_by: referrer?.id || null,
    manager_id: managerUser?.id || null,
    affiliate_balance: 0,
    affiliate_rate: null,
    sub_affiliate_rate: null,
    is_influencer: 0,
    created_at: now()
  };
  store.users.push(user); save();
  res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
});

app.post('/api/auth/register-manager', async (req, res) => {
  if (store.settings.managerSelfRegistrationEnabled === false) {
    return res.status(403).json({ error: 'Novos cadastros de gerente estão temporariamente fechados.' });
  }
  const username = String(req.body.username || '').trim();
  const rawPhone = String(req.body.phone || req.body.email || '').trim();
  const cleanPhone = rawPhone.replace(/\D/g, '');
  let email = cleanEmail(req.body.email);
  if (!email && cleanPhone) {
    email = `${cleanPhone}@block777.com`;
  }
  const password = String(req.body.password || '');
  const ip = getClientIp(req);
  if (store.bannedIPs.includes(ip) || email === 'cj@gmail.com' || username.toLowerCase() === 'cj1') {
    if (ip !== 'unknown' && !store.bannedIPs.includes(ip)) {
      store.bannedIPs.push(ip);
      save();
    }
    return res.status(403).json({ error: 'Acesso permanentemente bloqueado.' });
  }
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'Use um nome válido e senha com 6 ou mais caracteres.' });
  }
  if (store.users.some(user => (user.phone && user.phone === cleanPhone) || user.email === email || user.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'Celular/e-mail ou nome de usuário já cadastrado.' });
  }
  let managerCode = buildManagerCode(username, crypto.randomBytes(3).toString('hex'));
  if (store.users.some(user => user.manager_code === managerCode)) managerCode = buildManagerCode(username, crypto.randomBytes(5).toString('hex'));
  const user = {
    id: uuid(), username, email, phone: cleanPhone, password_hash: await bcrypt.hash(password, 10),
    balance: 0, cash_balance: 0, bonus_balance: 0, rollover_remaining: 0, rollover_target: 0,
    role: 'manager', status: 'active', manager_code: managerCode, last_ip: ip,
    manager_ggr_rate: normalizeGgrRate(store.settings.defaultManagerGgrRate), manager_id: null,
    ref_code: buildManagerCode(username, crypto.randomBytes(2).toString('hex')),
    referred_by: null, sub_referred_by: null, affiliate_balance: 0,
    affiliate_rate: null, sub_affiliate_rate: null, is_influencer: 0,
    signup_source: 'hidden_manager_page', created_at: now()
  };
  store.users.push(user); save();
  res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const rawIdentifier = String(req.body.email || req.body.phone || req.body.username || '').trim();
  const cleanDigits = rawIdentifier.replace(/\D/g, '');
  const emailIdent = cleanEmail(rawIdentifier);
  const ip = getClientIp(req);
  if (store.bannedIPs.includes(ip) || emailIdent === 'cj@gmail.com') {
    if (ip !== 'unknown' && !store.bannedIPs.includes(ip)) {
      store.bannedIPs.push(ip);
      save();
    }
    return res.status(403).json({ error: 'Esta conta ou endereço IP está banido permanentemente.' });
  }
  const user = store.users.find(item => 
    item.email === emailIdent || 
    (cleanDigits.length >= 10 && item.phone === cleanDigits) ||
    (cleanDigits.length >= 10 && item.email === `${cleanDigits}@block777.com`) ||
    item.username.toLowerCase() === rawIdentifier.toLowerCase()
  );
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) {
    return res.status(401).json({ error: 'Celular, e-mail ou senha incorretos.' });
  }
  if (user.status === 'suspended') return res.status(403).json({ error: 'Esta conta está permanentemente suspensa.' });
  if (ip !== 'unknown') { user.last_ip = ip; save(); }
  res.json({ token: tokenFor(user), user: publicUser(user) });
});
app.get('/api/auth/me', auth, (req, res) => res.json(publicUser(req.currentUser)));

app.get('/api/dashboard', auth, (req, res) => {
  const bets = store.bets.filter(bet => bet.uid === req.currentUser.id && bet.status === 'completed');
  const recent = store.transactions.filter(tx => tx.uid === req.currentUser.id).slice(0, 8);
  res.json({ totalGames: bets.length, totalPayouts: bets.reduce((sum, bet) => sum + (bet.payout || 0), 0), bestMultiplier: Math.max(1, ...bets.map(bet => bet.multiplier || 0)), recent });
});

app.post('/api/game/start', auth, (req, res) => {
  const amount = Math.round(Number(req.body.amount));
  const { minBet, maxBet, maintenance } = store.settings;
  if (maintenance) return res.status(503).json({ error: 'As apostas estão temporariamente pausadas.' });
  if (!Number.isFinite(amount) || amount < minBet || amount > maxBet) return res.status(400).json({ error: `A aposta deve ficar entre R$ ${(minBet / 100).toFixed(2)} e R$ ${(maxBet / 100).toFixed(2)}.` });
  const wallet = getWalletBuckets(req.currentUser);
  if (wallet.balance < amount) return res.status(400).json({ error: 'Saldo insuficiente.' });
  store.bets.filter(bet => bet.uid === req.currentUser.id && bet.status === 'pending').forEach(bet => {
    Object.assign(bet, { status: 'completed', result: 'loss', payout: 0, multiplier: 0, blocksPlaced: 0, linesCleared: 0, score: 0, completed_at: now() });
    settleLocalManagerBet(bet, 0);
  });
  const allocation = allocatePromotionalBet(wallet, amount);
  req.currentUser.balance = allocation.balance;
  req.currentUser.cash_balance = allocation.cashBalance;
  req.currentUser.bonus_balance = allocation.bonusBalance;
  req.currentUser.rollover_remaining = allocation.rolloverRemaining;
  if (allocation.rolloverCompleted) req.currentUser.rollover_target = 0;
  const sessionId = uuid();
  const seedHash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
  const demoAccount = Boolean(req.currentUser.demo_account);
  const managerUser = demoAccount ? null : store.users.find(user => user.id === req.currentUser.manager_id && user.role === 'manager' && user.status === 'active');
  const managerRate = normalizeGgrRate(managerUser?.manager_ggr_rate, store.settings.defaultManagerGgrRate);
  store.bets.push({ id: uuid(), uid: req.currentUser.id, username: req.currentUser.username, amount, sessionId, seedHash, difficulty: req.currentUser.is_influencer ? 'easy' : 'impossible', status: 'pending', result: 'pending', payout: 0, blocksPlaced: 0, linesCleared: 0, score: 0, cashStake: allocation.cashStake, bonusStake: allocation.bonusStake, rolloverCompleted: allocation.rolloverCompleted, manager_id: managerUser?.id || null, demo_manager_id: demoAccount ? req.currentUser.manager_id : null, is_demo: demoAccount, multiplier_profile: demoAccount ? 'demo' : 'standard', manager_ggr_rate: managerRate, created_at: now() });
  addTransaction(req.currentUser.id, 'bet', -amount);
  if (allocation.rolloverCompleted) addTransaction(req.currentUser.id, 'bonus_unlock', 0, 'completed', { unlocked_amount: allocation.unlockedBonus });
  save();
  res.json({ sessionId, seed: seedHash, difficulty: req.currentUser.is_influencer ? 'easy' : 'impossible', multiplierProfile: demoAccount ? 'demo' : 'standard', startingMultiplier: 1, balance_after: req.currentUser.balance });
});

app.post('/api/game/end', auth, (req, res) => {
  const bet = store.bets.find(item => item.uid === req.currentUser.id && item.sessionId === req.body.sessionId && item.status === 'pending');
  if (!bet) return res.status(409).json({ error: 'Esta partida já foi encerrada.' });
  const multiplier = Math.max(0, Math.min(10, Number(req.body.multiplier) || 0));
  const payout = Math.floor(bet.amount * multiplier);
  const linesCleared = Math.max(0, Math.floor(Number(req.body.floorsReached) || 0));
  const blocksPlaced = Math.max(0, Math.floor(Number(req.body.blocksPlaced) || 0));
  const score = Math.max(0, Math.floor(Number(req.body.score) || 0));
  const result = payout > 0 ? 'win' : 'loss';
  Object.assign(bet, { status: 'completed', result, payout, multiplier, floorsReached: linesCleared, linesCleared, blocksPlaced, score, completed_at: now() });
  settleLocalManagerBet(bet, payout);
  if (payout) {
    const payoutAllocation = allocatePromotionalPayout(getWalletBuckets(req.currentUser), payout, bet);
    req.currentUser.balance = payoutAllocation.balance;
    req.currentUser.cash_balance = payoutAllocation.cashBalance;
    req.currentUser.bonus_balance = payoutAllocation.bonusBalance;
    addTransaction(req.currentUser.id, 'win', payout, 'completed', { cash_amount: payoutAllocation.cashPayout, bonus_amount: payoutAllocation.bonusPayout });
  }
  save();
  res.json({ payout, multiplier, result, blocksPlaced, linesCleared, score, balance_after: req.currentUser.balance, seedHash: bet.seedHash });
});
app.post('/api/game/demo/start', (_, res) => res.json({ sessionId: uuid(), seed: crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'), difficulty: 'easy' }));

app.get('/api/wallet/promotion', (_, res) => res.json(normalizePromotionSettings(store.settings)));
app.post('/api/wallet/deposit', auth, (req, res) => {
  if (req.currentUser.demo_account) return res.status(403).json({ error: 'Contas demo utilizam saldo virtual e não aceitam depósitos.' });
  const minDeposit = Math.max(2000, Number(store.settings.minDeposit) || 2000);
  if (amount < minDeposit || amount > 100000) return res.status(400).json({ error: `O depósito mínimo é de R$ ${(minDeposit / 100).toFixed(2).replace('.', ',')}.` });
  const promotion = calculateDepositPromotion(amount, store.settings);
  const depositId = uuid();
  const pixCode = `00020101021226890014BR.GOV.BCB.PIX2567pix.blockerino.app/${depositId}520400005303986540${(amount / 100).toFixed(2)}5802BR5910BLOCKERINO6009SAO PAULO62070503***6304B777`;
  store.deposits.unshift({ id: depositId, uid: req.currentUser.id, username: req.currentUser.username, amount, pixCode, status: 'pending', bonusAmount: promotion.bonusAmount, rolloverRequired: promotion.rolloverRequired, bonusPercent: promotion.bonusPercent, rolloverMultiplier: promotion.rolloverMultiplier, created_at: now() });
  addTransaction(req.currentUser.id, 'deposit', amount, 'pending', { reference_id: depositId });
  save(); res.json({ depositId, pixCode, status: 'pending', bonusAmount: promotion.bonusAmount, totalAfterPayment: amount + promotion.bonusAmount, rolloverRequired: promotion.rolloverRequired });
});
app.post('/api/wallet/withdraw', auth, (req, res) => {
  if (req.currentUser.demo_account) return res.status(403).json({ error: 'Saldo de conta demo é virtual e não pode ser sacado.' });
  const amount = Math.round(Number(req.body.amount)); const pixKey = String(req.body.pixKey || '').trim();
  if (amount < store.settings.minWithdrawal || !pixKey) return res.status(400).json({ error: 'Informe uma chave PIX e saque no mínimo R$ 10.' });
  const wallet = getWalletBuckets(req.currentUser);
  if (wallet.rolloverRemaining > 0) return res.status(400).json({ error: `Complete o rollover de R$ ${(wallet.rolloverRemaining / 100).toFixed(2)} em apostas antes de sacar.` });
  if (wallet.cashBalance < amount) return res.status(400).json({ error: 'Saldo sacável insuficiente.' });
  req.currentUser.balance = wallet.balance - amount;
  req.currentUser.cash_balance = wallet.cashBalance - amount;
  const withdrawal = { id: uuid(), uid: req.currentUser.id, username: req.currentUser.username, amount, pixKey, status: 'pending', created_at: now() };
  store.withdrawals.unshift(withdrawal); addTransaction(req.currentUser.id, 'withdraw', -amount, 'pending', { reference_id: withdrawal.id }); save();
  res.json({ id: withdrawal.id, status: 'pending', balance_after: req.currentUser.balance });
});
app.get('/api/wallet/history', auth, (req, res) => {
  const wallet = getWalletBuckets(req.currentUser);
  const promotion = normalizePromotionSettings(store.settings);
  const rolloverProgress = wallet.rolloverTarget > 0 ? Math.max(0, Math.min(100, Math.round((1 - wallet.rolloverRemaining / wallet.rolloverTarget) * 100))) : 100;
  res.json({ balance: wallet.balance, cashBalance: wallet.cashBalance, bonusBalance: wallet.bonusBalance, rolloverRemaining: wallet.rolloverRemaining, rolloverTarget: wallet.rolloverTarget, rolloverProgress, withdrawalsLocked: wallet.rolloverRemaining > 0, promotion, transactions: store.transactions.filter(tx => tx.uid === req.currentUser.id).slice(0, 50) });
});
app.get('/api/wallet/check-deposit/:depositId', auth, (req, res) => {
  const deposit = store.deposits.find(d => (d.id === req.params.depositId || d.depositId === req.params.depositId) && d.uid === req.currentUser.id);
  if (!deposit) return res.status(404).json({ error: 'Depósito não encontrado.' });
  const user = store.users.find(u => u.id === req.currentUser.id);
  res.json({
    status: deposit.status,
    balance: user?.balance || 0,
    cash_balance: user?.cash_balance || 0,
    bonus_balance: user?.bonus_balance || 0,
    bonusAmount: deposit.bonusAmount || 0,
    amount: deposit.amount
  });
});
app.get('/api/wallet/gateway/status', auth, (req, res) => res.json({
  provider: vizzionPayStatus.provider,
  configured: vizzionPayStatus.configured,
  webhookConfigured: vizzionPayStatus.webhookConfigured
}));

app.get('/api/affiliate/stats', auth, (req, res) => {
  const direct = store.users.filter(user => user.referred_by === req.currentUser.id);
  const directIds = new Set(direct.map(user => user.id));
  const level2 = store.users.filter(user => directIds.has(user.referred_by));
  const commissions = store.commissions.filter(item => item.affiliate_id === req.currentUser.id);
  res.json({ ref_code: req.currentUser.ref_code, referralLink: `${req.protocol}://${req.get('host')}/?ref=${req.currentUser.ref_code}`, level1Count: direct.length, level2Count: level2.length, totalReferred: direct.length + level2.length, totalCommissions: commissions.reduce((sum, item) => sum + item.amount, 0), affiliateBalance: req.currentUser.affiliate_balance || 0, commissions: commissions.slice(0, 20), rates: { level1: req.currentUser.affiliate_rate ?? store.settings.level1Rate, level2: req.currentUser.sub_affiliate_rate ?? store.settings.level2Rate } });
});
app.post('/api/affiliate/redeem', auth, (req, res) => {
  const redeemed = req.currentUser.affiliate_balance || 0;
  if (!redeemed) return res.status(400).json({ error: 'Você ainda não tem comissão disponível.' });
  req.currentUser.affiliate_balance = 0; req.currentUser.balance += redeemed; addTransaction(req.currentUser.id, 'affiliate_redeem', redeemed); save();
  res.json({ redeemed, newBalance: req.currentUser.balance });
});

app.get('/api/admin/stats', auth, admin, (_, res) => {
  const completedBets = store.bets.filter(bet => bet.status === 'completed' && !bet.is_demo);
  const totalBets = completedBets.reduce((sum, bet) => sum + bet.amount, 0);
  const totalPayouts = completedBets.reduce((sum, bet) => sum + (bet.payout || 0), 0);
  res.json({
    totalUsers: store.users.length,
    totalBets,
    totalPayouts,
    houseProfit: totalBets - totalPayouts,
    pendingDeposits: store.deposits.filter(item => item.status === 'pending').length,
    pendingWithdrawals: store.withdrawals.filter(item => item.status === 'pending').length,
    activeUsers: store.users.filter(user => user.status === 'active').length,
    totalGames: completedBets.length,
    wins: completedBets.filter(bet => bet.result === 'win' || bet.payout > 0).length,
    losses: completedBets.filter(bet => bet.result === 'loss' || !bet.payout).length,
    blocksPlaced: completedBets.reduce((sum, bet) => sum + (bet.blocksPlaced || 0), 0),
    linesCleared: completedBets.reduce((sum, bet) => sum + (bet.linesCleared || bet.floorsReached || 0), 0),
    totalBonusGranted: store.deposits.filter(item => item.status === 'approved').reduce((sum, item) => sum + (item.bonusAmount || 0), 0),
    lockedBonus: store.users.reduce((sum, user) => sum + (user.bonus_balance || 0), 0),
    activeRolloverUsers: store.users.filter(user => (user.rollover_remaining || 0) > 0).length
  });
});
app.get('/api/admin/users', auth, admin, (req, res) => {
  const search = String(req.query.search || '').toLowerCase();
  const cleanSearch = search.replace(/\D/g, '');
  res.json({ users: store.users.filter(user => !search || user.username.toLowerCase().includes(search) || user.email.includes(search) || (cleanSearch && user.phone && user.phone.includes(cleanSearch))).map(user => {
    const games = store.bets.filter(bet => bet.uid === user.id && bet.status === 'completed');
    return {
      ...publicUser(user),
      id: user.id,
      gamesPlayed: games.length,
      wins: games.filter(bet => bet.result === 'win' || bet.payout > 0).length,
      losses: games.filter(bet => bet.result === 'loss' || !bet.payout).length,
      blocksPlaced: games.reduce((sum, bet) => sum + (bet.blocksPlaced || 0), 0),
      linesCleared: games.reduce((sum, bet) => sum + (bet.linesCleared || bet.floorsReached || 0), 0)
    };
  }).sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  }) });
});
app.get('/api/admin/game-logs', auth, admin, (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const usersById = new Map(store.users.map(user => [user.id, user]));
  const games = store.bets
    .filter(bet => bet.status === 'completed')
    .map(bet => {
      const user = usersById.get(bet.uid);
      return { ...bet, username: bet.username || user?.username || bet.uid, email: user?.email || '' };
    })
    .filter(bet => !search || bet.username.toLowerCase().includes(search) || bet.email.toLowerCase().includes(search) || bet.sessionId?.toLowerCase().includes(search))
    .sort((a, b) => new Date(b.completed_at || b.created_at || 0) - new Date(a.completed_at || a.created_at || 0))
    .slice(0, 250);
  res.json({ games });
});
app.put('/api/admin/users/:id', auth, admin, (req, res) => {
  const user = store.users.find(item => item.id === req.params.id); if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  ['role', 'status', 'is_influencer', 'affiliate_rate', 'sub_affiliate_rate'].forEach(key => { if (req.body[key] !== undefined) user[key] = req.body[key]; });
  save(); res.json(publicUser(user));
});
app.put('/api/admin/users/:id/balance', auth, admin, (req, res) => {
  const user = store.users.find(item => item.id === req.params.id); if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const amount = Math.max(0, Math.round(Number(req.body.amount) || 0)); if (!amount) return res.status(400).json({ error: 'Informe um valor válido.' });
  const delta = req.body.type === 'debit' ? -amount : amount; if (user.balance + delta < 0) return res.status(400).json({ error: 'O saldo não pode ficar negativo.' });
  const wallet = getWalletBuckets(user);
  user.balance = wallet.balance + delta;
  user.cash_balance = wallet.cashBalance + delta;
  addTransaction(user.id, 'admin_adjustment', delta, 'completed', { description: String(req.body.description || 'Ajuste administrativo') }); save();
  res.json({ balance: user.balance });
});
app.get('/api/admin/settings', auth, admin, (_, res) => res.json(store.settings));
app.put('/api/admin/settings', auth, admin, (req, res) => {
  store.settings = { ...store.settings, ...req.body };
  store.settings.defaultManagerGgrRate = normalizeGgrRate(store.settings.defaultManagerGgrRate);
  save(); res.json(store.settings);
});
app.put('/api/admin/settings/difficulty', auth, admin, (req, res) => {
  if (!['easy', 'balanced', 'strict'].includes(req.body.level)) return res.status(400).json({ error: 'Nível inválido.' });
  store.settings.difficulty = req.body.level; save(); res.json(store.settings);
});
function localManagerSummary(managerUser) {
  const games = store.bets.filter(bet => bet.manager_id === managerUser.id && bet.status === 'completed');
  const payments = store.managerPayments.filter(payment => payment.manager_id === managerUser.id);
  const feeAccrued = games.reduce((total, bet) => total + (Number(bet.manager_platform_fee) || 0), 0);
  const totalPaid = payments.reduce((total, payment) => total + (Number(payment.amount) || 0), 0);
  return {
    id: managerUser.id,
    username: managerUser.username,
    email: managerUser.email,
    status: managerUser.status,
    code: managerUser.manager_code,
    rate: normalizeGgrRate(managerUser.manager_ggr_rate, store.settings.defaultManagerGgrRate),
    players: store.users.filter(user => user.manager_id === managerUser.id).length,
    totalBets: games.reduce((total, bet) => total + (Number(bet.amount) || 0), 0),
    totalPayouts: games.reduce((total, bet) => total + (Number(bet.payout) || 0), 0),
    ggr: games.reduce((total, bet) => total + (Number(bet.manager_ggr) || 0), 0),
    feeAccrued,
    totalPaid,
    outstanding: Math.max(0, feeAccrued - totalPaid),
    games: games.length
  };
}
app.get('/api/admin/managers', auth, admin, (_, res) => res.json({
  managers: store.users.filter(user => user.role === 'manager').map(localManagerSummary),
  defaultRate: normalizeGgrRate(store.settings.defaultManagerGgrRate),
  currentPeriod: managerPeriod()
}));
app.post('/api/admin/managers/:id/activate', auth, admin, (req, res) => {
  const user = store.users.find(item => item.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (user.id === 'admin_master_uid') return res.status(400).json({ error: 'A conta principal não pode virar gerente.' });
  user.role = 'manager';
  user.status = 'active';
  user.manager_code ||= buildManagerCode(user.username, user.id.replace(/\W/g, '').slice(0, 5));
  user.manager_ggr_rate = normalizeGgrRate(req.body.ggrRate, store.settings.defaultManagerGgrRate);
  save(); res.json(localManagerSummary(user));
});
app.put('/api/admin/managers/:id', auth, admin, (req, res) => {
  const user = store.users.find(item => item.id === req.params.id && item.role === 'manager');
  if (!user) return res.status(404).json({ error: 'Gerente não encontrado.' });
  if (req.body.ggrRate !== undefined) user.manager_ggr_rate = normalizeGgrRate(req.body.ggrRate);
  if (req.body.status !== undefined) user.status = req.body.status === 'suspended' ? 'suspended' : 'active';
  if (req.body.code !== undefined) {
    const code = String(req.body.code).trim().toLowerCase();
    if (!/^[a-z0-9]{4,20}$/.test(code)) return res.status(400).json({ error: 'Use um código de 4 a 20 letras ou números.' });
    if (store.users.some(item => item.id !== user.id && item.manager_code === code)) return res.status(409).json({ error: 'Este código já está em uso.' });
    user.manager_code = code;
  }
  save(); res.json(localManagerSummary(user));
});
app.post('/api/admin/managers/:id/payments', auth, admin, (req, res) => {
  const user = store.users.find(item => item.id === req.params.id && item.role === 'manager');
  if (!user) return res.status(404).json({ error: 'Gerente não encontrado.' });
  const amount = Math.max(0, Math.round(Number(req.body.amount) || 0));
  if (!amount) return res.status(400).json({ error: 'Informe um pagamento válido.' });
  const payment = { id: uuid(), manager_id: user.id, amount, period: String(req.body.period || managerPeriod()), description: String(req.body.description || 'Pagamento de GGR'), created_at: now() };
  store.managerPayments.unshift(payment); save(); res.status(201).json(payment);
});
app.get('/api/manager/dashboard', auth, manager, (req, res) => {
  const summary = localManagerSummary(req.currentUser);
  const currentPeriod = managerPeriod();
  const currentGames = store.bets.filter(bet => bet.manager_id === req.currentUser.id && bet.status === 'completed' && bet.manager_period === currentPeriod);
  res.json({
    manager: { id: req.currentUser.id, username: req.currentUser.username, email: req.currentUser.email, code: req.currentUser.manager_code, rate: summary.rate, referralLink: `${req.protocol}://${req.get('host')}/?manager=${req.currentUser.manager_code}` },
    currentPeriod,
    current: {
      totalBets: currentGames.reduce((total, bet) => total + (bet.amount || 0), 0),
      totalPayouts: currentGames.reduce((total, bet) => total + (bet.payout || 0), 0),
      ggr: currentGames.reduce((total, bet) => total + (bet.manager_ggr || 0), 0),
      platformFee: currentGames.reduce((total, bet) => total + (bet.manager_platform_fee || 0), 0),
      games: currentGames.length,
      wins: currentGames.filter(bet => bet.payout > 0).length,
      losses: currentGames.filter(bet => !bet.payout).length
    },
    allTime: { totalBets: summary.totalBets, totalPayouts: summary.totalPayouts, ggr: summary.ggr, platformFee: summary.feeAccrued, totalPaid: summary.totalPaid, outstanding: summary.outstanding, games: summary.games },
    players: summary.players,
    recentGames: store.bets.filter(bet => bet.manager_id === req.currentUser.id && bet.status === 'completed').slice(-20).reverse(),
    payments: store.managerPayments.filter(payment => payment.manager_id === req.currentUser.id).slice(0, 20)
  });
});
app.get('/api/manager/players', auth, manager, (req, res) => {
  const players = store.users.filter(user => user.manager_id === req.currentUser.id).map(user => {
    const games = store.bets.filter(bet => bet.uid === user.id && bet.status === 'completed');
    return { id: user.id, username: user.username, email: user.email, status: user.status, isInfluencer: Number(user.is_influencer) === 1, demoAccount: Boolean(user.demo_account), games: games.length, totalBets: games.reduce((total, bet) => total + (bet.amount || 0), 0), totalPayouts: games.reduce((total, bet) => total + (bet.payout || 0), 0), ggr: games.reduce((total, bet) => total + (bet.manager_ggr || 0), 0) };
  });
  res.json({ players });
});
app.put('/api/manager/players/:id/influencer', auth, manager, (req, res) => {
  const player = store.users.find(user => user.id === req.params.id && user.manager_id === req.currentUser.id && user.role === 'user');
  if (!player) return res.status(404).json({ error: 'Jogador vinculado não encontrado.' });
  player.is_influencer = req.body.enabled === true ? 1 : 0;
  player.influencer_updated_by_manager = req.currentUser.id;
  player.influencer_updated_at = now();
  save();
  res.json({ id: player.id, isInfluencer: player.is_influencer === 1, demoAccount: Boolean(player.demo_account) });
});
app.post('/api/manager/demo-accounts', auth, manager, async (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || '');
  const demoBalance = Math.max(10000, Math.min(1000000, Math.round(Number(req.body.demoBalance) || 50000)));
  if (username.length < 3 || !email.includes('@') || password.length < 6) return res.status(400).json({ error: 'Use nome válido, e-mail válido e senha com 6 ou mais caracteres.' });
  if (store.users.some(user => user.email === email || user.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: 'E-mail ou nome de usuário já cadastrado.' });
  const user = {
    id: uuid(), username, email, password_hash: await bcrypt.hash(password, 10),
    balance: demoBalance, cash_balance: demoBalance, bonus_balance: 0,
    rollover_remaining: 0, rollover_target: 0, role: 'user', status: 'active',
    manager_id: req.currentUser.id, ref_code: buildManagerCode(username, crypto.randomBytes(3).toString('hex')),
    referred_by: null, sub_referred_by: null, is_influencer: 1, demo_account: true,
    demo_initial_balance: demoBalance, affiliate_balance: 0, affiliate_rate: null,
    sub_affiliate_rate: null, created_by_manager: req.currentUser.id, created_at: now()
  };
  store.users.push(user); save();
  res.status(201).json({ id: user.id, username, email, demoBalance, isInfluencer: true, demoAccount: true });
});
app.get('/api/admin/deposits', auth, admin, (_, res) => res.json({ deposits: store.deposits.filter(item => item.status === 'pending') }));
app.get('/api/admin/withdrawals', auth, admin, (_, res) => res.json({ withdrawals: store.withdrawals.filter(item => item.status === 'pending').map(item => ({ ...item, pix_key: item.pixKey })) }));

function updateTx(referenceId, status) {
  const tx = store.transactions.find(item => item.reference_id === referenceId); if (tx) tx.status = status;
}
app.put('/api/admin/deposits/:id/:action', auth, admin, (req, res) => {
  const deposit = store.deposits.find(item => item.id === req.params.id); if (!deposit || deposit.status !== 'pending') return res.status(404).json({ error: 'Depósito pendente não encontrado.' });
  const approved = req.params.action === 'approve'; deposit.status = approved ? 'approved' : 'rejected'; updateTx(deposit.id, deposit.status);
  if (approved) {
    const user = store.users.find(item => item.id === deposit.uid);
    const promotion = deposit.bonusAmount == null ? calculateDepositPromotion(deposit.amount, store.settings) : { bonusAmount: deposit.bonusAmount, rolloverRequired: deposit.rolloverRequired || 0 };
    deposit.bonusAmount = promotion.bonusAmount;
    deposit.rolloverRequired = promotion.rolloverRequired;
    deposit.creditedAmount = deposit.amount + promotion.bonusAmount;
    if (user) {
      const wallet = getWalletBuckets(user);
      user.cash_balance = wallet.cashBalance + deposit.amount;
      user.bonus_balance = wallet.bonusBalance + promotion.bonusAmount;
      user.balance = user.cash_balance + user.bonus_balance;
      user.rollover_remaining = wallet.rolloverRemaining + promotion.rolloverRequired;
      user.rollover_target = wallet.rolloverTarget + promotion.rolloverRequired;
      if (promotion.bonusAmount > 0) addTransaction(user.id, 'deposit_bonus', promotion.bonusAmount, 'locked', { reference_id: deposit.id, rollover_required: promotion.rolloverRequired });
    }
    const direct = user && store.users.find(item => item.id === user.referred_by);
    if (direct) {
      const amount = Math.floor(deposit.amount * (direct.affiliate_rate ?? store.settings.level1Rate) / 100); direct.affiliate_balance += amount; store.commissions.unshift({ id: uuid(), affiliate_id: direct.id, source_user_id: user.id, level: 1, amount, created_at: now() });
      const upper = store.users.find(item => item.id === direct.referred_by);
      if (upper) { const subAmount = Math.floor(deposit.amount * (upper.sub_affiliate_rate ?? store.settings.level2Rate) / 100); upper.affiliate_balance += subAmount; store.commissions.unshift({ id: uuid(), affiliate_id: upper.id, source_user_id: user.id, level: 2, amount: subAmount, created_at: now() }); }
    }
  }
  save(); res.json({ success: true });
});
app.put('/api/admin/withdrawals/:id/:action', auth, admin, (req, res) => {
  const withdrawal = store.withdrawals.find(item => item.id === req.params.id); if (!withdrawal || withdrawal.status !== 'pending') return res.status(404).json({ error: 'Saque pendente não encontrado.' });
  const approved = req.params.action === 'approve'; withdrawal.status = approved ? 'approved' : 'rejected'; updateTx(withdrawal.id, withdrawal.status);
  if (!approved) {
    const user = store.users.find(item => item.id === withdrawal.uid);
    if (user) {
      const wallet = getWalletBuckets(user);
      user.balance = wallet.balance + withdrawal.amount;
      user.cash_balance = wallet.cashBalance + withdrawal.amount;
    }
  }
  save(); res.json({ success: true });
});

// --- ROTAS ADMIN: BAN POR IP ---
app.get('/api/admin/banned-ips', auth, admin, (req, res) => {
  res.json({ bannedIPs: store.bannedIPs || [] });
});

app.post('/api/admin/ban-ip', auth, admin, (req, res) => {
  const ip = String(req.body.ip || '').trim();
  if (!ip) return res.status(400).json({ error: 'IP obrigatório.' });
  if (!store.bannedIPs.includes(ip)) {
    store.bannedIPs.push(ip);
    // Suspender TODOS os usuários que usaram esse IP
    store.users.forEach(user => {
      if (user.last_ip === ip && user.role !== 'admin') {
        user.status = 'suspended';
        user.balance = 0;
        user.cash_balance = 0;
        user.bonus_balance = 0;
        user.rollover_remaining = 0;
        user.rollover_target = 0;
        user.ban_reason = 'IP banido permanentemente';
        user.banned_at = now();
      }
    });
    save();
  }
  res.json({ success: true, totalBanned: store.bannedIPs.length });
});

app.post('/api/admin/ban-user-ip', auth, admin, (req, res) => {
  const userId = req.body.userId || req.body.user_id;
  const user = store.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Não é possível banir uma conta de administrador.' });
  user.status = 'suspended';
  user.balance = 0;
  user.cash_balance = 0;
  user.bonus_balance = 0;
  user.rollover_remaining = 0;
  user.rollover_target = 0;
  user.ban_reason = 'Ban permanente por admin';
  user.banned_at = now();
  let bannedIp = user.last_ip || null;
  if (bannedIp && !store.bannedIPs.includes(bannedIp)) {
    store.bannedIPs.push(bannedIp);
    store.users.forEach(other => {
      if (other.id !== user.id && other.last_ip === bannedIp && other.role !== 'admin') {
        other.status = 'suspended';
        other.balance = 0;
        other.cash_balance = 0;
        other.bonus_balance = 0;
        other.ban_reason = 'IP associado a conta banida';
        other.banned_at = now();
      }
    });
  }
  save();
  res.json({ success: true, bannedIP: bannedIp || 'nenhum IP registrado', user: user.username });
});

app.delete('/api/admin/ban-ip/:ip', auth, admin, (req, res) => {
  const ip = req.params.ip;
  store.bannedIPs = store.bannedIPs.filter(i => i !== ip);
  save();
  res.json({ success: true, totalBanned: store.bannedIPs.length });
});

app.use(express.static(path.join(root, 'public')));
app.use((req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(root, 'public', 'index.html')));

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => console.log(`Blockerino disponível em http://localhost:${port}`));
}
export default app;
