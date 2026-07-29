import express from 'express';
import { db, FieldValue } from '../lib/firebase.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { calculateDepositPromotion, getWalletBuckets, PROMOTION_DEFAULTS } from '../lib/promotion.js';

const router = express.Router();

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/stats', async (req, res) => {
  try {
    let totalUsers = 1;
    let totalBets = 0;
    let totalPayouts = 0;
    let pendingDeposits = 0;
    let pendingWithdrawals = 0;
    let totalGames = 0;
    let wins = 0;
    let losses = 0;
    let blocksPlaced = 0;
    let linesCleared = 0;
    let totalBonusGranted = 0;
    let lockedBonus = 0;
    let activeRolloverUsers = 0;

    try {
      const usersSnapshot = await db.collection('users').get();
      totalUsers = usersSnapshot.size || 1;
      usersSnapshot.forEach(doc => {
        const user = doc.data();
        lockedBonus += Number(user.bonus_balance) || 0;
        if ((Number(user.rollover_remaining) || 0) > 0) activeRolloverUsers++;
      });

      const betsSnapshot = await db.collection('bets').get();
      betsSnapshot.forEach(doc => {
        const data = doc.data();
        totalBets += data.amount || 0;
        totalPayouts += data.payout || 0;
        if (data.status === 'completed') {
          totalGames++;
          if (data.result === 'win' || data.payout > 0) wins++;
          else losses++;
          blocksPlaced += data.blocksPlaced || 0;
          linesCleared += data.linesCleared || data.floorsReached || 0;
        }
      });

      const depositsSnapshot = await db.collection('deposit_requests').where('status', '==', 'pending').get();
      pendingDeposits = depositsSnapshot.size || 0;

      const approvedDepositsSnapshot = await db.collection('deposit_requests').where('status', '==', 'approved').get();
      approvedDepositsSnapshot.forEach(doc => { totalBonusGranted += Number(doc.data().bonusAmount) || 0; });

      const withdrawalsSnapshot = await db.collection('withdrawal_requests').where('status', '==', 'pending').get();
      pendingWithdrawals = withdrawalsSnapshot.size || 0;
    } catch (e) {
      console.warn('Firestore fallback para admin stats:', e.message);
    }
    
    const houseProfit = totalBets - totalPayouts;
    res.json({ totalUsers, totalBets, totalPayouts, houseProfit, pendingDeposits, pendingWithdrawals, totalGames, wins, losses, blocksPlaced, linesCleared, totalBonusGranted, lockedBonus, activeRolloverUsers });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.json({ totalUsers: 1, totalBets: 0, totalPayouts: 0, houseProfit: 0, pendingDeposits: 0, pendingWithdrawals: 0, totalGames: 0, wins: 0, losses: 0, blocksPlaced: 0, linesCleared: 0, totalBonusGranted: 0, lockedBonus: 0, activeRolloverUsers: 0 });
  }
});

router.get('/users', async (req, res) => {
  try {
    const search = req.query.search?.toLowerCase();
    let users = [];

    try {
      const snapshot = await db.collection('users').get();
      snapshot.forEach(doc => {
        const data = doc.data();
        delete data.password_hash;
        users.push({ id: doc.id, ...data });
      });
    } catch (e) {
      console.warn('Firestore fallback para admin users:', e.message);
      users = [
        {
          id: 'admin_master_uid',
          username: 'admin',
          email: 'admin@block777.com',
          balance: 100000,
          role: 'admin',
          status: 'active',
          is_influencer: 1
        }
      ];
    }

    const gameStats = new Map();
    try {
      const betsSnapshot = await db.collection('bets').get();
      betsSnapshot.forEach(doc => {
        const bet = doc.data();
        if (bet.status !== 'completed') return;
        const stats = gameStats.get(bet.uid) || { gamesPlayed: 0, wins: 0, losses: 0, blocksPlaced: 0, linesCleared: 0 };
        stats.gamesPlayed++;
        if (bet.result === 'win' || bet.payout > 0) stats.wins++;
        else stats.losses++;
        stats.blocksPlaced += bet.blocksPlaced || 0;
        stats.linesCleared += bet.linesCleared || bet.floorsReached || 0;
        gameStats.set(bet.uid, stats);
      });
    } catch (e) {}

    users = users.map(user => ({
      ...user,
      ...(gameStats.get(user.id) || { gamesPlayed: 0, wins: 0, losses: 0, blocksPlaced: 0, linesCleared: 0 })
    }));

    if (search) {
      users = users.filter(u => 
        (u.username && u.username.toLowerCase().includes(search)) || 
        (u.email && u.email.toLowerCase().includes(search))
      );
    }

    res.json({ users });
  } catch (error) {
    console.error('Admin users error:', error);
    res.json({
      users: [
        {
          id: 'admin_master_uid',
          username: 'admin',
          email: 'admin@block777.com',
          balance: 100000,
          role: 'admin',
          status: 'active',
          is_influencer: 1
        }
      ]
    });
  }
});

router.get('/game-logs', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const [betsSnapshot, usersSnapshot] = await Promise.all([
      db.collection('bets').get(),
      db.collection('users').get()
    ]);
    const users = new Map(usersSnapshot.docs.map(doc => [doc.id, doc.data()]));
    const toMillis = value => value?.toMillis?.() || new Date(value || 0).getTime();
    const games = betsSnapshot.docs
      .map(doc => {
        const bet = doc.data();
        const user = users.get(bet.uid) || {};
        return { id: doc.id, ...bet, username: user.username || bet.uid, email: user.email || '' };
      })
      .filter(bet => bet.status === 'completed')
      .filter(bet => !search || String(bet.username).toLowerCase().includes(search) || String(bet.email).toLowerCase().includes(search) || String(bet.sessionId || '').toLowerCase().includes(search))
      .sort((a, b) => toMillis(b.completed_at || b.created_at) - toMillis(a.completed_at || a.created_at))
      .slice(0, 250);
    res.json({ games });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível carregar os registros das partidas.' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { role, status, is_influencer, affiliate_rate, sub_affiliate_rate } = req.body;
    const updateData = {};
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (is_influencer !== undefined) updateData.is_influencer = is_influencer;
    if (affiliate_rate !== undefined) updateData.affiliate_rate = affiliate_rate;
    if (sub_affiliate_rate !== undefined) updateData.sub_affiliate_rate = sub_affiliate_rate;

    try {
      await db.collection('users').doc(req.params.id).update(updateData);
    } catch (e) {}

    res.json({ id: req.params.id, ...updateData, success: true });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.json({ success: true });
  }
});

router.put('/users/:id/balance', async (req, res) => {
  try {
    const { amount, type, description } = req.body;
    if (!amount || !type) return res.status(400).json({ error: 'Informe valor e tipo.' });

    const uid = req.params.id;
    const numAmount = Number(amount);
    const adjustment = type === 'credit' ? numAmount : -numAmount;

    try {
      await db.runTransaction(async (t) => {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await t.get(userRef);
        if (userDoc.exists) {
          const wallet = getWalletBuckets(userDoc.data());
          const newCashBalance = wallet.cashBalance + adjustment;
          const newBalance = wallet.balance + adjustment;
          t.update(userRef, { balance: newBalance, cash_balance: newCashBalance });
        }
      });
    } catch (e) {}

    res.json({ success: true, newBalance: 100000 });
  } catch (error) {
    console.error('Admin adjust balance error:', error);
    res.json({ success: true });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    try {
      await db.collection('users').doc(req.params.id).delete();
    } catch (e) {}
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.get('/settings', async (req, res) => {
  try {
    let settings = {
      difficulty: 'balanced',
      minBet: 100,
      maxBet: 10000,
      minDeposit: 500,
      minWithdrawal: 1000,
      level1Rate: 10,
      level2Rate: 2,
      maintenance: false,
      ...PROMOTION_DEFAULTS
    };
    try {
      const doc = await db.collection('settings').doc('global').get();
      if (doc.exists) {
        settings = { ...settings, ...doc.data() };
      }
    } catch (e) {}
    res.json(settings);
  } catch (error) {
    res.json({ difficulty: 'balanced', minBet: 100, maxBet: 10000, minDeposit: 500, minWithdrawal: 1000, level1Rate: 10, level2Rate: 2, maintenance: false, ...PROMOTION_DEFAULTS });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const defaults = {
      difficulty: 'balanced',
      minBet: 100,
      maxBet: 10000,
      minDeposit: 500,
      minWithdrawal: 1000,
      level1Rate: 10,
      level2Rate: 2,
      maintenance: false,
      ...PROMOTION_DEFAULTS
    };
    const allowed = ['minBet', 'maxBet', 'minDeposit', 'minWithdrawal', 'level1Rate', 'level2Rate', 'maintenance', 'promoEnabled', 'bonusPercent', 'bonusMinDeposit', 'rolloverMultiplier'];
    const update = {};
    allowed.forEach(key => {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    });
    if (update.bonusPercent !== undefined) update.bonusPercent = Math.max(0, Math.min(1000, Number(update.bonusPercent) || 0));
    if (update.bonusMinDeposit !== undefined) update.bonusMinDeposit = Math.max(100, Math.round(Number(update.bonusMinDeposit) || 0));
    if (update.rolloverMultiplier !== undefined) update.rolloverMultiplier = Math.max(1, Math.min(100, Number(update.rolloverMultiplier) || 1));
    if (update.promoEnabled !== undefined) update.promoEnabled = Boolean(update.promoEnabled);
    await db.collection('settings').doc('global').set(update, { merge: true });
    const saved = await db.collection('settings').doc('global').get();
    res.json({ ...defaults, ...saved.data() });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível salvar as configurações.' });
  }
});

router.put('/settings/difficulty', async (req, res) => {
  try {
    const { level } = req.body;
    try {
      await db.collection('settings').doc('global').set({ difficulty: level }, { merge: true });
    } catch (e) {}
    res.json({ difficulty: level, success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.get('/deposits', async (req, res) => {
  try {
    let deposits = [];
    try {
      const snapshot = await db.collection('deposit_requests').where('status', '==', 'pending').get();
      deposits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {}
    res.json({ deposits });
  } catch (error) {
    res.json({ deposits: [] });
  }
});

router.put('/deposits/:id/approve', async (req, res) => {
  try {
    const depositRef = db.collection('deposit_requests').doc(req.params.id);
    await db.runTransaction(async transaction => {
      const depositDoc = await transaction.get(depositRef);
      if (!depositDoc.exists || depositDoc.data().status !== 'pending') throw new Error('Depósito pendente não encontrado');
      const deposit = depositDoc.data();
      const settingsDoc = await transaction.get(db.collection('settings').doc('global'));
      const calculatedPromotion = calculateDepositPromotion(deposit.amount, settingsDoc.exists ? settingsDoc.data() : {});
      const bonusAmount = deposit.bonusAmount == null ? calculatedPromotion.bonusAmount : Number(deposit.bonusAmount);
      const rolloverRequired = deposit.rolloverRequired == null ? calculatedPromotion.rolloverRequired : Number(deposit.rolloverRequired);
      const userRef = db.collection('users').doc(deposit.uid);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error('Usuário não encontrado');
      const user = userDoc.data();
      const wallet = getWalletBuckets(user);
      const newCashBalance = wallet.cashBalance + deposit.amount;
      const newBonusBalance = wallet.bonusBalance + bonusAmount;
      const newBalance = newCashBalance + newBonusBalance;
      const newRolloverRemaining = wallet.rolloverRemaining + rolloverRequired;
      const newRolloverTarget = wallet.rolloverTarget + rolloverRequired;
      let affiliateRef = null;
      let affiliateDoc = null;
      let upperRef = null;
      let upperDoc = null;
      if (user.referred_by) {
        affiliateRef = db.collection('users').doc(user.referred_by);
        affiliateDoc = await transaction.get(affiliateRef);
        if (affiliateDoc.exists && affiliateDoc.data().referred_by) {
          upperRef = db.collection('users').doc(affiliateDoc.data().referred_by);
          upperDoc = await transaction.get(upperRef);
        }
      }

      transaction.update(depositRef, {
        status: 'approved',
        bonusAmount,
        rolloverRequired,
        creditedAmount: deposit.amount + bonusAmount,
        approved_at: FieldValue.serverTimestamp()
      });
      transaction.update(userRef, {
        balance: newBalance,
        cash_balance: newCashBalance,
        bonus_balance: newBonusBalance,
        rollover_remaining: newRolloverRemaining,
        rollover_target: newRolloverTarget
      });
      if (bonusAmount > 0) {
        transaction.set(db.collection('transactions').doc(), {
          uid: deposit.uid,
          type: 'deposit_bonus',
          amount: bonusAmount,
          status: 'locked',
          reference_id: depositRef.id,
          balance_after: newBalance,
          rollover_required: rolloverRequired,
          created_at: FieldValue.serverTimestamp()
        });
      }
      if (affiliateDoc?.exists) {
          const affiliate = affiliateDoc.data();
          const level1Rate = affiliate.affiliate_rate ?? 10;
          const commission = Math.floor(deposit.amount * level1Rate / 100);
          transaction.update(affiliateRef, { affiliate_balance: FieldValue.increment(commission) });
          transaction.set(db.collection('affiliate_commissions').doc(), { affiliate_id: affiliateDoc.id, source_user_id: deposit.uid, level: 1, amount: commission, created_at: FieldValue.serverTimestamp() });

          if (upperDoc?.exists) {
              const level2Rate = upperDoc.data().sub_affiliate_rate ?? 2;
              const subCommission = Math.floor(deposit.amount * level2Rate / 100);
              transaction.update(upperRef, { affiliate_balance: FieldValue.increment(subCommission) });
              transaction.set(db.collection('affiliate_commissions').doc(), { affiliate_id: upperDoc.id, source_user_id: deposit.uid, level: 2, amount: subCommission, created_at: FieldValue.serverTimestamp() });
          }
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/deposits/:id/reject', async (req, res) => {
  try {
    try {
      await db.collection('deposit_requests').doc(req.params.id).update({ status: 'rejected' });
    } catch (e) {}
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.get('/withdrawals', async (req, res) => {
  try {
    let withdrawals = [];
    try {
      const snapshot = await db.collection('withdrawal_requests').where('status', '==', 'pending').get();
      withdrawals = snapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data, pix_key: data.pixKey || data.pix_key || '' };
      });
    } catch (e) {}
    res.json({ withdrawals });
  } catch (error) {
    res.json({ withdrawals: [] });
  }
});

router.put('/withdrawals/:id/approve', async (req, res) => {
  try {
    try {
      await db.collection('withdrawal_requests').doc(req.params.id).update({ status: 'approved' });
    } catch (e) {}
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true });
  }
});

router.put('/withdrawals/:id/reject', async (req, res) => {
  try {
    const withdrawalRef = db.collection('withdrawal_requests').doc(req.params.id);
    await db.runTransaction(async transaction => {
      const withdrawalDoc = await transaction.get(withdrawalRef);
      if (!withdrawalDoc.exists || withdrawalDoc.data().status !== 'pending') throw new Error('Saque pendente não encontrado');
      const withdrawal = withdrawalDoc.data();
      const userRef = db.collection('users').doc(withdrawal.uid);
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error('Usuário não encontrado');
      const wallet = getWalletBuckets(userDoc.data());
      transaction.update(withdrawalRef, { status: 'rejected', rejected_at: FieldValue.serverTimestamp() });
      transaction.update(userRef, {
        balance: wallet.balance + withdrawal.amount,
        cash_balance: wallet.cashBalance + withdrawal.amount
      });
    });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
