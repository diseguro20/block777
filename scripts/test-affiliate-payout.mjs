import assert from 'node:assert/strict';
import { normalizePayoutDescription, resolveAffiliatePayout } from '../lib/affiliatePayout.js';

assert.deepEqual(resolveAffiliatePayout({ amount: 2500, availableBalance: 4000 }), {
  amount: 2500,
  balanceBefore: 4000,
  balanceAfter: 1500
});
assert.deepEqual(resolveAffiliatePayout({ amount: 4000, availableBalance: 4000 }).balanceAfter, 0);
assert.throws(() => resolveAffiliatePayout({ amount: 4001, availableBalance: 4000 }), /maior/);
assert.throws(() => resolveAffiliatePayout({ amount: 0, availableBalance: 4000 }), /válido/);
assert.equal(normalizePayoutDescription(`  PIX confirmado  `), 'PIX confirmado');
console.log('Affiliate payout validation passed.');
