import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import authRouter from '../routes/auth.js';
import gameRouter from '../routes/game.js';
import walletRouter from '../routes/wallet.js';
import affiliateRouter from '../routes/affiliate.js';
import adminRouter from '../routes/admin.js';
import { db as firebaseDb } from '../lib/firebase.js';
import { authenticateToken as firebaseAuthMiddleware } from '../middleware/auth.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataFile = path.join(root, '.data', 'local-db.json');
const now = () => new Date().toISOString();
const cleanEmail = value => String(value || '').trim().toLowerCase();
const useFirebase = Boolean(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

const defaultData = {
  users: [
    { id: 'admin_master_uid', username: 'admin', email: 'admin@block777.com', password_hash: bcrypt.hashSync('admin777', 10), balance: 100000, role: 'admin', status: 'active', ref_code: 'admin777', referred_by: null, affiliate_balance: 0, affiliate_rate: 10, sub_affiliate_rate: 2, is_influencer: 1, created_at: now() },
    { id: 'demo_user', username: 'demo', email: 'demo@blockerino.app', password_hash: bcrypt.hashSync('demo123', 10), balance: 5000, role: 'user', status: 'active', ref_code: 'demo777', referred_by: null, affiliate_balance: 0, affiliate_rate: 10, sub_affiliate_rate: 2, is_influencer: 0, created_at: now() }
  ],
  bets: [], transactions: [], deposits: [], withdrawals: [], commissions: [],
  settings: { difficulty: 'balanced', minBet: 100, maxBet: 10000, minDeposit: 500, minWithdrawal: 1000, level1Rate: 10, level2Rate: 2, maintenance: false }
};

function loadData() {
  try {
    if (fs.existsSync(dataFile)) return { ...defaultData, ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) };
  } catch (error) { console.warn('Banco local não pôde ser lido:', error.message); }
  return structuredClone(defaultData);
}
let store = loadData();
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
    if (!req.currentUser || req.currentUser.status === 'suspended') return res.status(403).json({ error: 'Conta indisponível.' });
    next();
  } catch (_) { res.status(403).json({ error: 'Sua sessão expirou. Entre novamente.' }); }
}
function admin(req, res, next) {
  if (req.currentUser?.role !== 'admin') return res.status(403).json({ error: 'Acesso exclusivo para administradores.' });
  next();
}
function addTransaction(uid, type, amount, status = 'completed', extra = {}) {
  const user = store.users.find(item => item.id === uid);
  const tx = { id: uuid(), uid, type, amount, status, balance_after: user?.balance || 0, created_at: now(), ...extra };
  store.transactions.unshift(tx);
  return tx;
}

// Na Vercel, usa as coleções duráveis do Firebase já configuradas no projeto.
// Localmente, mantém o banco em arquivo para desenvolvimento sem credenciais.
if (useFirebase) {
  app.use('/api/auth', authRouter);
  app.use('/api/game', gameRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/affiliate', affiliateRouter);
  app.use('/api/admin', adminRouter);
  app.get('/api/dashboard', firebaseAuthMiddleware, async (req, res) => {
    try {
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

app.get('/api/health', (_, res) => res.json({ ok: true, service: 'blockerino', time: now() }));

app.post('/api/auth/register', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || '');
  if (username.length < 3 || !email.includes('@') || password.length < 6) return res.status(400).json({ error: 'Use um nome válido, e-mail válido e senha com 6 ou mais caracteres.' });
  if (store.users.some(user => user.email === email || user.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: 'E-mail ou nome de usuário já cadastrado.' });
  const referrer = store.users.find(user => user.ref_code === String(req.body.referred_by || '').toLowerCase());
  const user = { id: uuid(), username, email, password_hash: await bcrypt.hash(password, 10), balance: 0, role: 'user', status: 'active', ref_code: `${username.replace(/\W/g, '').slice(0, 12)}${crypto.randomBytes(2).toString('hex')}`.toLowerCase(), referred_by: referrer?.id || null, affiliate_balance: 0, affiliate_rate: null, sub_affiliate_rate: null, is_influencer: 0, created_at: now() };
  store.users.push(user); save();
  res.status(201).json({ token: tokenFor(user), user: publicUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const user = store.users.find(item => item.email === cleanEmail(req.body.email));
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'Esta conta está suspensa.' });
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
  if (req.currentUser.balance < amount) return res.status(400).json({ error: 'Saldo insuficiente.' });
  store.bets.filter(bet => bet.uid === req.currentUser.id && bet.status === 'pending').forEach(bet => { bet.status = 'completed'; bet.payout = 0; bet.multiplier = 0; bet.completed_at = now(); });
  req.currentUser.balance -= amount;
  const sessionId = uuid();
  const seedHash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
  store.bets.push({ id: uuid(), uid: req.currentUser.id, amount, sessionId, seedHash, difficulty: req.currentUser.is_influencer ? 'easy' : store.settings.difficulty, status: 'pending', payout: 0, created_at: now() });
  addTransaction(req.currentUser.id, 'bet', -amount);
  save();
  res.json({ sessionId, seed: seedHash, difficulty: req.currentUser.is_influencer ? 'easy' : store.settings.difficulty, balance_after: req.currentUser.balance });
});

app.post('/api/game/end', auth, (req, res) => {
  const bet = store.bets.find(item => item.uid === req.currentUser.id && item.sessionId === req.body.sessionId && item.status === 'pending');
  if (!bet) return res.status(409).json({ error: 'Esta partida já foi encerrada.' });
  const multiplier = Math.max(0, Math.min(10, Number(req.body.multiplier) || 0));
  const payout = Math.floor(bet.amount * multiplier);
  Object.assign(bet, { status: 'completed', payout, multiplier, floorsReached: Math.max(0, Number(req.body.floorsReached) || 0), completed_at: now() });
  if (payout) { req.currentUser.balance += payout; addTransaction(req.currentUser.id, 'win', payout); }
  save();
  res.json({ payout, multiplier, balance_after: req.currentUser.balance, seedHash: bet.seedHash });
});
app.post('/api/game/demo/start', (_, res) => res.json({ sessionId: uuid(), seed: crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'), difficulty: 'easy' }));

app.post('/api/wallet/deposit', auth, (req, res) => {
  const amount = Math.round(Number(req.body.amount));
  if (amount < store.settings.minDeposit || amount > 100000) return res.status(400).json({ error: 'O depósito deve ficar entre R$ 5 e R$ 1.000.' });
  const depositId = uuid();
  const pixCode = `00020101021226890014BR.GOV.BCB.PIX2567pix.blockerino.app/${depositId}520400005303986540${(amount / 100).toFixed(2)}5802BR5910BLOCKERINO6009SAO PAULO62070503***6304B777`;
  store.deposits.unshift({ id: depositId, uid: req.currentUser.id, username: req.currentUser.username, amount, pixCode, status: 'pending', created_at: now() });
  addTransaction(req.currentUser.id, 'deposit', amount, 'pending', { reference_id: depositId });
  save(); res.json({ depositId, pixCode, status: 'pending' });
});
app.post('/api/wallet/withdraw', auth, (req, res) => {
  const amount = Math.round(Number(req.body.amount)); const pixKey = String(req.body.pixKey || '').trim();
  if (amount < store.settings.minWithdrawal || !pixKey) return res.status(400).json({ error: 'Informe uma chave PIX e saque no mínimo R$ 10.' });
  if (req.currentUser.balance < amount) return res.status(400).json({ error: 'Saldo insuficiente.' });
  req.currentUser.balance -= amount;
  const withdrawal = { id: uuid(), uid: req.currentUser.id, username: req.currentUser.username, amount, pixKey, status: 'pending', created_at: now() };
  store.withdrawals.unshift(withdrawal); addTransaction(req.currentUser.id, 'withdraw', -amount, 'pending', { reference_id: withdrawal.id }); save();
  res.json({ id: withdrawal.id, status: 'pending', balance_after: req.currentUser.balance });
});
app.get('/api/wallet/history', auth, (req, res) => res.json({ balance: req.currentUser.balance, transactions: store.transactions.filter(tx => tx.uid === req.currentUser.id).slice(0, 50) }));

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
  const completedBets = store.bets.filter(bet => bet.status === 'completed');
  const totalBets = completedBets.reduce((sum, bet) => sum + bet.amount, 0);
  const totalPayouts = completedBets.reduce((sum, bet) => sum + (bet.payout || 0), 0);
  res.json({ totalUsers: store.users.length, totalBets, totalPayouts, houseProfit: totalBets - totalPayouts, pendingDeposits: store.deposits.filter(item => item.status === 'pending').length, pendingWithdrawals: store.withdrawals.filter(item => item.status === 'pending').length, activeUsers: store.users.filter(user => user.status === 'active').length, totalGames: store.bets.length });
});
app.get('/api/admin/users', auth, admin, (req, res) => {
  const search = String(req.query.search || '').toLowerCase();
  res.json({ users: store.users.filter(user => !search || user.username.toLowerCase().includes(search) || user.email.includes(search)).map(user => ({ ...publicUser(user), id: user.id })) });
});
app.put('/api/admin/users/:id', auth, admin, (req, res) => {
  const user = store.users.find(item => item.id === req.params.id); if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  ['status', 'is_influencer', 'affiliate_rate', 'sub_affiliate_rate'].forEach(key => { if (req.body[key] !== undefined) user[key] = req.body[key]; });
  save(); res.json(publicUser(user));
});
app.put('/api/admin/users/:id/balance', auth, admin, (req, res) => {
  const user = store.users.find(item => item.id === req.params.id); if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const amount = Math.max(0, Math.round(Number(req.body.amount) || 0)); if (!amount) return res.status(400).json({ error: 'Informe um valor válido.' });
  const delta = req.body.type === 'debit' ? -amount : amount; if (user.balance + delta < 0) return res.status(400).json({ error: 'O saldo não pode ficar negativo.' });
  user.balance += delta; addTransaction(user.id, 'admin_adjustment', delta, 'completed', { description: String(req.body.description || 'Ajuste administrativo') }); save();
  res.json({ balance: user.balance });
});
app.get('/api/admin/settings', auth, admin, (_, res) => res.json(store.settings));
app.put('/api/admin/settings', auth, admin, (req, res) => { store.settings = { ...store.settings, ...req.body }; save(); res.json(store.settings); });
app.put('/api/admin/settings/difficulty', auth, admin, (req, res) => {
  if (!['easy', 'balanced', 'strict'].includes(req.body.level)) return res.status(400).json({ error: 'Nível inválido.' });
  store.settings.difficulty = req.body.level; save(); res.json(store.settings);
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
    const user = store.users.find(item => item.id === deposit.uid); if (user) user.balance += deposit.amount;
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
  if (!approved) { const user = store.users.find(item => item.id === withdrawal.uid); if (user) user.balance += withdrawal.amount; }
  save(); res.json({ success: true });
});

app.use(express.static(path.join(root, 'public')));
app.use((req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(root, 'public', 'index.html')));

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 3001);
  app.listen(port, () => console.log(`Blockerino disponível em http://localhost:${port}`));
}
export default app;
