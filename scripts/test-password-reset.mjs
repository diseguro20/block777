import assert from 'node:assert/strict';
import { createPasswordResetCode, hashPasswordResetCode, isPasswordResetExpired, maskResetContact, safeCodeMatch } from '../lib/passwordReset.js';

const code = createPasswordResetCode();
assert.match(code, /^\d{6}$/);
const digest = hashPasswordResetCode('request-1', code, 'test-secret');
assert.equal(safeCodeMatch(digest, hashPasswordResetCode('request-1', code, 'test-secret')), true);
assert.equal(safeCodeMatch(digest, hashPasswordResetCode('request-1', '000000', 'test-secret')), false);
assert.equal(isPasswordResetExpired(new Date(Date.now() - 1)), true);
assert.equal(isPasswordResetExpired(new Date(Date.now() + 60_000)), false);
assert.equal(maskResetContact({ phone: '11987654321' }), '***4321');
assert.equal(maskResetContact({ email: 'cliente@example.com' }), 'cl***@example.com');
console.log('Password reset security validated.');
