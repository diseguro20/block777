import assert from 'node:assert/strict';
import { calculateGgrEntry, managerPeriod, normalizeGgrRate } from '../lib/ggr.js';

assert.deepEqual(
  calculateGgrEntry({ betAmount: 10000, payout: 6000, rate: 30 }),
  { betAmount: 10000, payout: 6000, ggr: 4000, rate: 30, platformFee: 1200 }
);

assert.deepEqual(
  calculateGgrEntry({ betAmount: 10000, payout: 12000, rate: 30 }),
  { betAmount: 10000, payout: 12000, ggr: -2000, rate: 30, platformFee: -600 }
);

assert.equal(normalizeGgrRate(130), 100);
assert.equal(normalizeGgrRate(-5), 0);
assert.match(managerPeriod(new Date('2026-08-08T12:00:00Z')), /^2026-08$/);

console.log('GGR calculations validated.');
