import assert from 'node:assert/strict';
import { buildAffiliateReport } from '../lib/affiliateReporting.js';

const report = buildAffiliateReport({
  users: [
    { id: 'a', username: 'Afiliado A', ref_code: 'a1' },
    { id: 'b', username: 'Afiliado B', ref_code: 'b1' },
    { id: 'l1', referred_by: 'a' },
    { id: 'l2', referred_by: 'b', sub_referred_by: 'a' }
  ],
  deposits: [
    { uid: 'l1', status: 'approved', amount: 5000, approved_at: '2026-09-12' },
    { uid: 'l1', status: 'approved', amount: 5000, approved_at: '2026-09-13' },
    { uid: 'l2', status: 'approved', amount: 2000, approved_at: '2026-09-14' },
    { uid: 'l2', status: 'pending', amount: 9000 }
  ],
  commissions: [
    { affiliate_id: 'a', amount: 1000 },
    { affiliate_id: 'a', amount: 40 },
    { affiliate_id: 'b', amount: 200 }
  ]
});

assert.equal(report.affiliates[0].id, 'a');
assert.equal(report.affiliates[0].direct_deposited, 10000);
assert.equal(report.affiliates[0].second_level_deposited, 2000);
assert.equal(report.affiliates[0].direct_depositors, 1);
assert.equal(report.summary.approved_deposits, 3);
assert.equal(report.summary.attributed_revenue, 12000);
assert.equal(report.summary.commissions_generated, 1240);
console.log('Affiliate revenue report validated.');
