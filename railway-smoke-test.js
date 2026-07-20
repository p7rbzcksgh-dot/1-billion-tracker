'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function waitFor(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const port = 39000 + Math.floor(Math.random() * 1000);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcg-railway-smoke-'));
  const dbPath = path.join(tempDir, 'monitor.sqlite');
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_PASSWORD: '#1Billion',
      COOKIE_SECRET: 'railway-smoke-test-secret-that-is-long-enough',
      COOKIE_SECURE: 'false',
      TRUST_PROXY: 'false',
      DB_PATH: dbPath,
      DISABLE_SCRAPER: 'true',
      SCRAPER_START_DELAY_MS: '0',
      MAIL_STREAM_MODE: 'true',
      TEAMS_ENABLED: 'true',
      TEAMS_STREAM_MODE: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  try {
    const base = `http://127.0.0.1:${port}`;
    const health = await waitFor(`${base}/healthz`);
    const healthBody = await health.json();
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.version, '1.9.1');
    assert.equal(healthBody.milestoneCount, 9);
    assert.deepEqual(healthBody.countdownRemaining, [10000000, 5000000, 2000000, 500000, 100000, 50000, 10000, 5000]);

    const indexResponse = await fetch(`${base}/`);
    assert.equal(indexResponse.status, 200);
    assert.match(await indexResponse.text(), /TCG Machines/i);
    assert.equal((await fetch(`${base}/styles.css`)).status, 200);
    assert.equal((await fetch(`${base}/client.js`)).status, 200);
    assert.equal((await fetch(`${base}/tcg-machines-logo.jpeg`)).status, 200);
    assert.equal((await fetch(`${base}/phyzbatch-wizard.webp`)).status, 200);

    const login = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: '#1Billion' })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.ok(cookie && cookie.includes('tcg_monitor_auth='));

    const stateResponse = await fetch(`${base}/api/state`, {
      headers: { cookie }
    });
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.settings.alertTarget, 1000000000);
    assert.equal(state.monitorStatus, 'disabled');
    assert.equal(state.milestones.length, 9);
    assert.equal(state.milestoneEmailsSent, 0);
    assert.equal(state.milestoneTeamsSent, 0);
    assert.equal(state.teamsConfigured, true);

    const addResponse = await fetch(`${base}/api/recipients`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ email: 'railway-test@example.com' })
    });
    assert.equal(addResponse.status, 201);
    const afterAdd = await addResponse.json();
    assert.equal(afterAdd.recipients.length, 1);

    const emailResponse = await fetch(`${base}/api/test-email`, {
      method: 'POST',
      headers: { cookie }
    });
    assert.equal(emailResponse.status, 200);
    const emailResult = await emailResponse.json();
    assert.equal(emailResult.recipientCount, 1);

    const teamsResponse = await fetch(`${base}/api/test-teams`, {
      method: 'POST',
      headers: { cookie }
    });
    assert.equal(teamsResponse.status, 200);
    const teamsResult = await teamsResponse.json();
    assert.equal(teamsResult.simulated, true);

    assert.equal(fs.existsSync(dbPath), true);
    console.log('Railway smoke test passed: health, login, state, persistence, recipients, email and Microsoft Teams test flows.');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (child.exitCode && child.exitCode !== 0) {
      console.error(output);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
