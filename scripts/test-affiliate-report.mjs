import assert from 'node:assert/strict';
import { buildAffiliateReport } from '../lib/affiliateReporting.js';
import { affiliateIdsForDeposit, attributionFromUser, buildRegistrationAttribution } from '../lib/attribution.js';

const registration = buildRegistrationAttribution({ referrerId: 'a', referrer: { ref_code: 'a1', username: 'Afiliado A', referred_by: 'upline' } });
assert.deepEqual(affiliateIdsForDeposit({ attribution: registration }, { referred_by: 'wrong' }), { affiliateId: 'a', subAffiliateId: 'upline', managerId: null });
assert.deepEqual(affiliateIdsForDeposit({ attribution: { version: 1, source: 'direct' } }, { referred_by: 'wrong' }), { affiliateId: null, subAffiliateId: null, managerId: null });
assert.equal(attributionFromUser({ referred_by: 'legacy' }).affiliate_id, 'legacy');

const report = buildAffiliateReport({
  users: [
    { id: 'a', username: 'Afiliado A', ref_code: 'a1', affiliate_balance: 440 },
    { id: 'b', username: 'Afiliado B', ref_code: 'b1', affiliate_balance: 200 },
    { id: 'l1', referred_by: 'a' },
    { id: 'l2', referred_by: 'b', sub_referred_by: 'a' },
    { id: 'l3', referred_by: 'b' }
  ],
  deposits: [
    { uid: 'l1', status: 'approved', amount: 5000, approved_at: '2026-09-12' },
    { uid: 'l1', status: 'approved', amount: 5000, approved_at: '2026-09-13' },
    { uid: 'l2', status: 'approved', amount: 2000, approved_at: '2026-09-14' },
    { uid: 'l3', status: 'approved', amount: 300, attribution: { version: 1, affiliate_id: 'a', sub_affiliate_id: null } },
    { uid: 'l2', status: 'pending', amount: 9000 }
  ],
  commissions: [
    { affiliate_id: 'a', amount: 1000 },
    { affiliate_id: 'a', amount: 40 },
    { affiliate_id: 'b', amount: 200 }
  ],
  payouts: [
    { affiliate_id: 'a', amount: 600, status: 'paid', paid_at: '2026-09-14' },
    { affiliate_id: 'a', amount: 100, status: 'cancelled' }
  ]
});

assert.equal(report.affiliates[0].id, 'a');
assert.equal(report.affiliates[0].direct_deposited, 10300);
assert.equal(report.affiliates[0].second_level_deposited, 2000);
assert.equal(report.affiliates[0].direct_depositors, 2);
assert.equal(report.summary.approved_deposits, 4);
assert.equal(report.summary.attributed_revenue, 12300);
assert.equal(report.summary.commissions_generated, 1240);
assert.equal(report.affiliates[0].paid_total, 600);
assert.equal(report.affiliates[0].payout_count, 1);
assert.equal(report.summary.paid_total, 600);
assert.equal(report.summary.payable_total, 640);
console.log('Affiliate revenue report validated.');
