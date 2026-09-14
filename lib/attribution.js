export function buildRegistrationAttribution({ referrerId = null, referrer = {}, managerId = null, manager = {} } = {}) {
  const affiliateId = referrerId || null;
  const managerAccountId = managerId || null;
  return {
    version: 1,
    source: affiliateId && managerAccountId ? 'affiliate_manager' : affiliateId ? 'affiliate' : managerAccountId ? 'manager' : 'direct',
    affiliate_id: affiliateId,
    affiliate_code: affiliateId ? String(referrer.ref_code || '') : '',
    affiliate_name: affiliateId ? String(referrer.username || referrer.email || '') : '',
    sub_affiliate_id: affiliateId ? (referrer.referred_by || null) : null,
    manager_id: managerAccountId,
    manager_code: managerAccountId ? String(manager.manager_code || '') : '',
    manager_name: managerAccountId ? String(manager.username || manager.email || '') : ''
  };
}

export function attributionFromUser(user = {}) {
  const saved = user.attribution || {};
  const immutable = Number(saved.version) >= 1;
  const affiliateId = immutable ? (saved.affiliate_id || null) : (user.referred_by || null);
  const managerId = immutable ? (saved.manager_id || null) : (user.manager_id || null);
  return {
    version: 1,
    source: saved.source || (affiliateId && managerId ? 'affiliate_manager' : affiliateId ? 'affiliate' : managerId ? 'manager' : 'direct'),
    affiliate_id: affiliateId,
    affiliate_code: String(saved.affiliate_code || user.signup_ref_code || ''),
    affiliate_name: String(saved.affiliate_name || ''),
    sub_affiliate_id: immutable ? (saved.sub_affiliate_id || null) : (user.sub_referred_by || null),
    manager_id: managerId,
    manager_code: String(saved.manager_code || user.signup_manager_code || ''),
    manager_name: String(saved.manager_name || ''),
    registered_at: saved.registered_at || user.created_at || null
  };
}

export function affiliateIdsForDeposit(deposit = {}, user = {}) {
  const snapshot = deposit.attribution || {};
  const immutable = Number(snapshot.version) >= 1;
  return {
    affiliateId: immutable ? (snapshot.affiliate_id || null) : (deposit.referred_by || user.referred_by || null),
    subAffiliateId: immutable ? (snapshot.sub_affiliate_id || null) : (deposit.sub_referred_by || user.sub_referred_by || null),
    managerId: immutable ? (snapshot.manager_id || null) : (deposit.manager_id || user.manager_id || null)
  };
}
