import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blockerino-manager-demo-'));
process.env.VERCEL = '1';
process.env.FIREBASE_CLIENT_EMAIL = '';
process.env.FIREBASE_PRIVATE_KEY = '';
process.env.BLOCKERINO_DATA_FILE = path.join(tempDir, 'local-db.json');

const { default: app } = await import(`../api/index.js?manager-demo-test=${Date.now()}`);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

try {
  const stamp = Date.now();
  const managerRegistration = await request('/api/auth/register-manager', {
    method: 'POST', body: JSON.stringify({ username: `manager${stamp}`, email: `manager${stamp}@example.com`, password: 'teste123' })
  });
  assert.equal(managerRegistration.response.status, 201);
  const managerAuth = { Authorization: `Bearer ${managerRegistration.data.token}` };

  const demoCreation = await request('/api/manager/demo-accounts', {
    method: 'POST', headers: managerAuth,
    body: JSON.stringify({ username: `demo${stamp}`, email: `demo${stamp}@example.com`, password: 'demo123', demoBalance: 75000 })
  });
  assert.equal(demoCreation.response.status, 201);
  assert.equal(demoCreation.data.demoAccount, true);
  assert.equal(demoCreation.data.demoBalance, 75000);

  const playerId = demoCreation.data.id;
  const otherManager = await request('/api/auth/register-manager', {
    method: 'POST', body: JSON.stringify({ username: `other${stamp}`, email: `other${stamp}@example.com`, password: 'teste123' })
  });
  const unauthorizedToggle = await request(`/api/manager/players/${playerId}/influencer`, {
    method: 'PUT', headers: { Authorization: `Bearer ${otherManager.data.token}` }, body: JSON.stringify({ enabled: false })
  });
  assert.equal(unauthorizedToggle.response.status, 404);

  const disabled = await request(`/api/manager/players/${playerId}/influencer`, {
    method: 'PUT', headers: managerAuth, body: JSON.stringify({ enabled: false })
  });
  assert.equal(disabled.data.isInfluencer, false);
  const enabled = await request(`/api/manager/players/${playerId}/influencer`, {
    method: 'PUT', headers: managerAuth, body: JSON.stringify({ enabled: true })
  });
  assert.equal(enabled.data.isInfluencer, true);

  const demoLogin = await request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: demoCreation.data.email, password: 'demo123' })
  });
  assert.equal(demoLogin.response.status, 200);
  const demoAuth = { Authorization: `Bearer ${demoLogin.data.token}` };
  assert.equal((await request('/api/wallet/deposit', { method: 'POST', headers: demoAuth, body: JSON.stringify({ amount: 2000 }) })).response.status, 403);
  assert.equal((await request('/api/wallet/withdraw', { method: 'POST', headers: demoAuth, body: JSON.stringify({ amount: 1000, pixKey: 'qa@example.com' }) })).response.status, 403);

  const gameStart = await request('/api/game/start', { method: 'POST', headers: demoAuth, body: JSON.stringify({ amount: 500 }) });
  assert.equal(gameStart.response.status, 200);
  assert.equal(gameStart.data.difficulty, 'easy');
  assert.equal(gameStart.data.multiplierProfile, 'demo');
  await request('/api/game/end', {
    method: 'POST', headers: demoAuth,
    body: JSON.stringify({ sessionId: gameStart.data.sessionId, multiplier: 2, floorsReached: 1, blocksPlaced: 4, score: 100 })
  });
  const dashboard = await request('/api/manager/dashboard', { headers: managerAuth });
  assert.equal(dashboard.data.current.ggr, 0);
  assert.equal(dashboard.data.current.platformFee, 0);

  const adminLogin = await request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'admin@block777.com', password: 'admin777' })
  });
  const adminStats = await request('/api/admin/stats', { headers: { Authorization: `Bearer ${adminLogin.data.token}` } });
  assert.equal(adminStats.data.totalBets, 0);
  assert.equal(adminStats.data.totalPayouts, 0);

  const players = await request('/api/manager/players', { headers: managerAuth });
  const demoPlayer = players.data.players.find(player => player.id === playerId);
  assert.equal(demoPlayer.demoAccount, true);
  assert.equal(demoPlayer.isInfluencer, true);
  console.log('Manager demo flow validated.');
} finally {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
