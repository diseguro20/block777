export const PROMOTION_DEFAULTS = {
  promoEnabled: true,
  bonusPercent: 100,
  bonusMinDeposit: 2000,
  rolloverMultiplier: 10,
  depositRolloverMultiplier: 1,
  promotionVersion: 'double-2026-08'
};

export function normalizePromotionSettings(settings = {}) {
  return {
    promoEnabled: settings.promoEnabled ?? PROMOTION_DEFAULTS.promoEnabled,
    bonusPercent: Math.max(0, Math.min(1000, Number(settings.bonusPercent ?? PROMOTION_DEFAULTS.bonusPercent))),
    bonusMinDeposit: Math.max(0, Math.round(Number(settings.bonusMinDeposit ?? PROMOTION_DEFAULTS.bonusMinDeposit))),
    rolloverMultiplier: Math.max(0, Math.min(100, Number(settings.rolloverMultiplier ?? PROMOTION_DEFAULTS.rolloverMultiplier))),
    depositRolloverMultiplier: Math.max(0, Math.min(100, Number(settings.depositRolloverMultiplier ?? PROMOTION_DEFAULTS.depositRolloverMultiplier)))
  };
}

export function calculateDepositPromotion(amount, settings = {}) {
  const promo = normalizePromotionSettings(settings);
  const numAmount = Math.max(0, Math.round(Number(amount) || 0));
  const eligible = promo.promoEnabled && numAmount >= promo.bonusMinDeposit;
  const bonusAmount = eligible ? Math.floor(numAmount * promo.bonusPercent / 100) : 0;
  const depositRollover = Math.ceil(numAmount * promo.depositRolloverMultiplier);
  const bonusRollover = Math.ceil(bonusAmount * promo.rolloverMultiplier);
  const rolloverRequired = depositRollover + bonusRollover;
  return { ...promo, eligible, bonusAmount, depositRollover, bonusRollover, rolloverRequired };
}

export function getWalletBuckets(user = {}) {
  const balance = Math.round(Number(user.balance) || 0);
  const bonusBalance = Math.max(0, Math.min(balance, Math.round(Number(user.bonus_balance) || 0)));
  let cashBalance = user.cash_balance == null
    ? balance - bonusBalance
    : Math.round(Number(user.cash_balance) || 0);

  if (cashBalance + bonusBalance !== balance) cashBalance = balance - bonusBalance;

  return {
    balance,
    cashBalance,
    bonusBalance,
    rolloverRemaining: Math.max(0, Math.round(Number(user.rollover_remaining) || 0)),
    rolloverTarget: Math.max(0, Math.round(Number(user.rollover_target) || 0))
  };
}

export function allocatePromotionalBet(wallet, amount) {
  const stake = Math.max(0, Math.round(Number(amount) || 0));
  const bonusStake = Math.min(wallet.bonusBalance, stake);
  const cashStake = stake - bonusStake;
  let bonusBalance = wallet.bonusBalance - bonusStake;
  let cashBalance = wallet.cashBalance - cashStake;
  const balance = wallet.balance - stake;
  const rolloverRemaining = Math.max(0, wallet.rolloverRemaining - stake);
  const rolloverCompleted = wallet.rolloverRemaining > 0 && rolloverRemaining === 0;
  const unlockedBonus = rolloverCompleted ? bonusBalance : 0;

  if (rolloverCompleted) {
    cashBalance += unlockedBonus;
    bonusBalance = 0;
  }

  return {
    balance,
    cashBalance,
    bonusBalance,
    rolloverRemaining,
    rolloverCompleted,
    unlockedBonus,
    bonusStake,
    cashStake
  };
}

export function allocatePromotionalPayout(wallet, payout, bet = {}) {
  const safePayout = Math.max(0, Math.round(Number(payout) || 0));
  const bonusRatio = bet.rolloverCompleted
    ? 0
    : Math.max(0, Math.min(1, (Number(bet.bonusStake) || 0) / Math.max(1, Number(bet.amount) || 0)));
  const bonusPayout = Math.floor(safePayout * bonusRatio);
  const cashPayout = safePayout - bonusPayout;

  return {
    balance: wallet.balance + safePayout,
    cashBalance: wallet.cashBalance + cashPayout,
    bonusBalance: wallet.bonusBalance + bonusPayout,
    cashPayout,
    bonusPayout
  };
}
