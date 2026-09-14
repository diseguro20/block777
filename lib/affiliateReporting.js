const timestampMillis = value => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const seconds = Number(value.seconds ?? value._seconds);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const cents = value => Math.max(0, Math.round(Number(value) || 0));

export function buildAffiliateReport({ users = [], deposits = [], commissions = [], payouts = [] } = {}) {
  const usersById = new Map(users.map(user => [user.id, user]));
  const rows = new Map();
  const ensure = id => {
    const user = usersById.get(id);
    if (!user) return null;
    if (!rows.has(id)) rows.set(id, {
      id,
      username: user.username || user.email || 'Afiliado',
      email: user.email || '',
      phone: user.phone || '',
      ref_code: user.ref_code || '',
      is_influencer: Number(user.is_influencer) === 1,
      status: user.status || 'active',
      affiliate_rate: Number(user.affiliate_rate ?? 10),
      sub_affiliate_rate: Number(user.sub_affiliate_rate ?? 2),
      affiliate_balance: cents(user.affiliate_balance),
      direct_leads: 0,
      second_level_leads: 0,
      direct_depositors: new Set(),
      second_level_depositors: new Set(),
      approved_deposits: 0,
      second_level_deposits: 0,
      direct_deposited: 0,
      second_level_deposited: 0,
      commissions_generated: 0,
      historical_adjustment_total: 0,
      paid_total: 0,
      payout_count: 0,
      last_paid_at: null,
      last_deposit_at: null,
      created_at: user.created_at || null
    });
    return rows.get(id);
  };

  users.forEach(user => {
    if (Number(user.is_influencer) === 1 || cents(user.affiliate_balance) > 0) ensure(user.id);
    if (user.referred_by) {
      const row = ensure(user.referred_by);
      if (row) row.direct_leads++;
    }
    if (user.sub_referred_by && user.sub_referred_by !== user.referred_by) {
      const row = ensure(user.sub_referred_by);
      if (row) row.second_level_leads++;
    }
  });

  deposits.forEach(deposit => {
    if (deposit.status !== 'approved') return;
    const lead = usersById.get(deposit.uid);
    const snapshot = deposit.attribution || {};
    const immutable = Number(snapshot.version) >= 1;
    const affiliateId = immutable ? snapshot.affiliate_id : (deposit.referred_by || lead?.referred_by);
    const subAffiliateId = immutable ? snapshot.sub_affiliate_id : (deposit.sub_referred_by || lead?.sub_referred_by);
    const amount = cents(deposit.amount);
    const approvedAt = deposit.approved_at || deposit.created_at || null;
    if (affiliateId) {
      const row = ensure(affiliateId);
      if (row) {
        row.direct_depositors.add(deposit.uid);
        row.approved_deposits++;
        row.direct_deposited += amount;
        if (timestampMillis(approvedAt) > timestampMillis(row.last_deposit_at)) row.last_deposit_at = approvedAt;
      }
    }
    if (subAffiliateId && subAffiliateId !== affiliateId) {
      const row = ensure(subAffiliateId);
      if (row) {
        row.second_level_depositors.add(deposit.uid);
        row.second_level_deposits++;
        row.second_level_deposited += amount;
        if (timestampMillis(approvedAt) > timestampMillis(row.last_deposit_at)) row.last_deposit_at = approvedAt;
      }
    }
  });

  commissions.forEach(commission => {
    const row = ensure(commission.affiliate_id);
    if (row) row.commissions_generated += cents(commission.amount);
  });

  payouts.forEach(payout => {
    if (payout.status !== 'paid') return;
    const row = ensure(payout.affiliate_id);
    if (!row) return;
    row.paid_total += cents(payout.amount);
    const adjustmentAmount = cents(payout.adjustment_amount);
    row.historical_adjustment_total += adjustmentAmount;
    row.commissions_generated += adjustmentAmount;
    row.payout_count++;
    const paidAt = payout.paid_at || payout.created_at || null;
    if (timestampMillis(paidAt) > timestampMillis(row.last_paid_at)) row.last_paid_at = paidAt;
  });

  const affiliates = [...rows.values()].map(row => ({
    ...row,
    direct_depositors: row.direct_depositors.size,
    second_level_depositors: row.second_level_depositors.size,
    network_deposited: row.direct_deposited + row.second_level_deposited
  })).sort((a, b) => b.direct_deposited - a.direct_deposited || b.commissions_generated - a.commissions_generated || timestampMillis(b.created_at) - timestampMillis(a.created_at));

  return {
    affiliates,
    summary: {
      affiliates: affiliates.length,
      affiliates_with_deposits: affiliates.filter(item => item.approved_deposits > 0).length,
      approved_deposits: affiliates.reduce((sum, item) => sum + item.approved_deposits, 0),
      attributed_revenue: affiliates.reduce((sum, item) => sum + item.direct_deposited, 0),
      commissions_generated: affiliates.reduce((sum, item) => sum + item.commissions_generated, 0),
      paid_total: affiliates.reduce((sum, item) => sum + item.paid_total, 0),
      payable_total: affiliates.reduce((sum, item) => sum + item.affiliate_balance, 0)
    }
  };
}
