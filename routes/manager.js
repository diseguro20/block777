import express from 'express';
import { db } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireManager } from '../middleware/manager.js';
import { DEFAULT_MANAGER_GGR_RATE, managerPeriod, normalizeGgrRate } from '../lib/ggr.js';

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

export default router;
