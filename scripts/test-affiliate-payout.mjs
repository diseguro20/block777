import assert from 'node:assert/strict';
import { normalizePayoutDescription, resolveAffiliatePayout } from '../lib/affiliatePayout.js';

assert.deepEqual(resolveAffiliatePayout({ amount: 2500, availableBalance: 4000 }), {
  amount: 2500,
  balanceBefore: 4000,
  balanceAfter: 1500,
  adjustmentAmount: 0
});
assert.deepEqual(resolveAffiliatePayout({ amount: 4000, availableBalance: 4000 }).balanceAfter, 0);
assert.throws(() => resolveAffiliatePayout({ amount: 4001, availableBalance: 4000 }), /maior/);
assert.deepEqual(resolveAffiliatePayout({ amount: 5500, availableBalance: 4000, allowAdjustment: true }), {
  amount: 5500,
  balanceBefore: 4000,
  balanceAfter: 0,
  adjustmentAmount: 1500
});
assert.equal(resolveAffiliatePayout({ amount: 2000, availableBalance: 0, allowAdjustment: true }).adjustmentAmount, 2000);
assert.throws(() => resolveAffiliatePayout({ amount: 0, availableBalance: 4000 }), /válido/);
assert.equal(normalizePayoutDescription(`  PIX confirmado  `), 'PIX confirmado');
console.log('Affiliate payout validation passed.');
