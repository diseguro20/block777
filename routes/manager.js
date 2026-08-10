import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireManager } from '../middleware/manager.js';
import { buildManagerCode, DEFAULT_MANAGER_GGR_RATE, managerPeriod, normalizeGgrRate } from '../lib/ggr.js';

const router = express.Router();
router.use(authenticateToken);
router.use(requireManager);

const toMillis = value => value?.toMillis?.() || new Date(value || 0).getTime();
const sum = (items, field) => items.reduce((total, item) => total + (Number(item[field]) || 0), 0);

router.get('/dashboard', async (req, res) => {
  try {
    const managerId = req.managerUser.id;
    const currentPeriod = managerPeriod();
    const [settingsDoc, metricsSnapshot, playersSnapshot, paymentsSnapshot, betsSnapshot] = await Promise.all([
      db.collection('settings').doc('global').get(),
      db.collection('manager_metrics').where('manager_id', '==', managerId).get(),
      db.collection('users').where('manager_id', '==', managerId).get(),
      db.collection('manager_payments').where('manager_id', '==', managerId).get(),
      db.collection('bets').where('manager_id', '==', managerId).get()
    ]);

    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const rate = normalizeGgrRate(req.managerUser.manager_ggr_rate, settings.defaultManagerGgrRate ?? DEFAULT_MANAGER_GGR_RATE);
    const metrics = metricsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const current = metrics.find(item => item.period === currentPeriod) || {};
    const payments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const feeAccrued = sum(metrics, 'platform_fee');
    const totalPaid = sum(payments, 'amount');
    const recentGames = betsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => item.status === 'completed')
      .sort((a, b) => toMillis(b.completed_at || b.created_at) - toMillis(a.completed_at || a.created_at))
      .slice(0, 20);

    res.json({
      manager: {
        id: managerId,
        username: req.managerUser.username,
        email: req.managerUser.email,
        code: req.managerUser.manager_code,
        rate,
        referralLink: `${req.protocol}://${req.get('host')}/?manager=${encodeURIComponent(req.managerUser.manager_code || '')}`
      },
      currentPeriod,
      current: {
        totalBets: Number(current.total_bets || 0),
        totalPayouts: Number(current.total_payouts || 0),
        ggr: Number(current.ggr || 0),
        platformFee: Number(current.platform_fee || 0),
        games: Number(current.games || 0),
        wins: Number(current.wins || 0),
        losses: Number(current.losses || 0)
      },
      allTime: {
        totalBets: sum(metrics, 'total_bets'),
        totalPayouts: sum(metrics, 'total_payouts'),
        ggr: sum(metrics, 'ggr'),
        platformFee: feeAccrued,
        totalPaid,
        outstanding: Math.max(0, feeAccrued - totalPaid),
        games: sum(metrics, 'games')
      },
      players: playersSnapshot.size,
      recentGames,
      payments: payments.sort((a, b) => toMillis(b.created_at) - toMillis(a.created_at)).slice(0, 20)
    });
  } catch (error) {
    console.error('Manager dashboard error:', error);
    res.status(500).json({ error: 'Não foi possível carregar o painel do gerente.' });
  }
});

router.get('/players', async (req, res) => {
  try {
    const playersSnapshot = await db.collection('users').where('manager_id', '==', req.managerUser.id).get();
    const players = await Promise.all(playersSnapshot.docs.map(async playerDoc => {
      const betsSnapshot = await db.collection('bets').where('uid', '==', playerDoc.id).get();
      const games = betsSnapshot.docs.map(doc => doc.data()).filter(item => item.status === 'completed');
      return {
        id: playerDoc.id,
        username: playerDoc.data().username,
        email: playerDoc.data().email,
        status: playerDoc.data().status,
        isInfluencer: Number(playerDoc.data().is_influencer) === 1,
        demoAccount: Boolean(playerDoc.data().demo_account),
        games: games.length,
        totalBets: sum(games, 'amount'),
        totalPayouts: sum(games, 'payout'),
        ggr: sum(games, 'manager_ggr')
      };
    }));
    res.json({ players });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar os jogadores vinculados.' });
  }
});

router.put('/players/:id/influencer', async (req, res) => {
  try {
    const playerRef = db.collection('users').doc(req.params.id);
    const playerDoc = await playerRef.get();
    if (!playerDoc.exists || playerDoc.data().manager_id !== req.managerUser.id || playerDoc.data().role !== 'user') {
      return res.status(404).json({ error: 'Jogador vinculado não encontrado.' });
    }
    const enabled = req.body.enabled === true;
    await playerRef.update({
      is_influencer: enabled ? 1 : 0,
      influencer_updated_by_manager: req.managerUser.id,
      influencer_updated_at: FieldValue.serverTimestamp()
    });
    res.json({ id: playerDoc.id, isInfluencer: enabled, demoAccount: Boolean(playerDoc.data().demo_account) });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível atualizar o modo influenciador.' });
  }
});

router.post('/demo-accounts', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const demoBalance = Math.max(10000, Math.min(1000000, Math.round(Number(req.body.demoBalance) || 50000)));
    if (username.length < 3 || !email.includes('@') || password.length < 6) {
      return res.status(400).json({ error: 'Use nome válido, e-mail válido e senha com 6 ou mais caracteres.' });
    }
    const [emailCheck, usernameCheck] = await Promise.all([
      db.collection('users').where('email', '==', email).limit(1).get(),
      db.collection('users').where('username', '==', username).limit(1).get()
    ]);
    if (!emailCheck.empty) return res.status(409).json({ error: 'E-mail já cadastrado.' });
    if (!usernameCheck.empty) return res.status(409).json({ error: 'Nome de usuário em uso.' });

    const password_hash = await bcrypt.hash(password, 10);
    const ref_code = buildManagerCode(username, crypto.randomBytes(3).toString('hex'));
    const demoUser = {
      username,
      email,
      password_hash,
      balance: demoBalance,
      cash_balance: demoBalance,
      bonus_balance: 0,
      rollover_remaining: 0,
      rollover_target: 0,
      role: 'user',
      status: 'active',
      manager_id: req.managerUser.id,
      ref_code,
      referred_by: null,
      sub_referred_by: null,
      is_influencer: 1,
      demo_account: true,
      demo_initial_balance: demoBalance,
      affiliate_balance: 0,
      affiliate_rate: null,
      sub_affiliate_rate: null,
      created_by_manager: req.managerUser.id,
      created_at: FieldValue.serverTimestamp()
    };
    const docRef = await db.collection('users').add(demoUser);
    res.status(201).json({ id: docRef.id, username, email, demoBalance, isInfluencer: true, demoAccount: true });
  } catch (error) {
    console.error('Manager demo account error:', error);
    res.status(500).json({ error: 'Não foi possível criar a conta demo.' });
  }
});

export default router;
