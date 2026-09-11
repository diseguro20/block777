import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blockerino-deposit-idempotency-'));
process.env.VERCEL = '1';
process.env.FIREBASE_CLIENT_EMAIL = '';
process.env.FIREBASE_PRIVATE_KEY = '';
process.env.BLOCKERINO_DATA_FILE = path.join(tempDir, 'local-db.json');
process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';

const { default: app } = await import(`../api/index.js?deposit-idempotency=${Date.now()}`);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  return { response, data: await response.json() };
}

try {
  const registration = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'deposit_test', phone: '11987654321', password: 'secure123' })
  });
  assert.equal(registration.response.status, 201);
  const headers = { Authorization: `Bearer ${registration.data.token}` };
  const attempts = await Promise.all(Array.from({ length: 3 }, () => request('/api/wallet/deposit', {
    method: 'POST',
    headers,
    body: JSON.stringify({ amount: 5000 })
  })));
  assert.ok(attempts.every(attempt => attempt.response.status === 200));
  assert.equal(new Set(attempts.map(attempt => attempt.data.depositId)).size, 1);
  assert.equal(new Set(attempts.map(attempt => attempt.data.pixCode)).size, 1);
  assert.equal(attempts.filter(attempt => attempt.data.reused === true).length, 2);
  console.log('Deposit idempotency validated with three simultaneous requests.');
} finally {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
