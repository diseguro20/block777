import assert from 'node:assert/strict';
import { resolveDepositCredit } from '../lib/depositCredit.js';
import { extractVizzionTransaction } from '../lib/vizzionpay.js';

const standard = resolveDepositCredit({ amount: 2000, bonusAmount: 2000, rolloverRequired: 22000 }, {});
assert.deepEqual(standard, { bonusAmount: 2000, rolloverRequired: 22000, creditedAmount: 4000 });
const storedZero = resolveDepositCredit({ amount: 1000, bonusAmount: 0, rolloverRequired: 1000 }, { bonusPercent: 100 });
assert.deepEqual(storedZero, { bonusAmount: 0, rolloverRequired: 1000, creditedAmount: 1000 });
const calculated = resolveDepositCredit({ amount: 2000 }, {});
assert.equal(calculated.creditedAmount, 4000);
assert.equal(calculated.rolloverRequired, 22000);
const transaction = { id: 'tx-1', status: 'COMPLETED', identifier: 'dep-1' };
assert.equal(extractVizzionTransaction({ data: [transaction] }, { gatewayId: 'tx-1', referenceId: 'dep-1' }), transaction);
assert.equal(extractVizzionTransaction({ transactions: [transaction] }, { gatewayId: 'tx-1' }), transaction);
console.log('Automatic deposit credit and gateway response parsing validated.');
