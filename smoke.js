const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (_) {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const root = __dirname;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tcg-monitor-smoke-'));
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_PASSWORD: '#1Billion',
      COOKIE_SECRET: 'smoke-test-cookie-secret-with-sufficient-length',
      COOKIE_SECURE: 'false',
      TRUST_PROXY: 'false',
      DB_PATH: path.join(temp, 'monitor.sqlite'),
      DISABLE_SCRAPER: 'true',
      MAIL_STREAM_MODE: 'true',
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  try {
    const base = `http://127.0.0.1:${port}`;
    await waitFor(`${base}/health`);

    const anonymousState = await fetch(`${base}/api/state`);
    if (anonymousState.status !== 401) throw new Error('Protected API accepted an anonymous request.');

    const badLogin = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' })
    });
    if (badLogin.status !== 401) throw new Error('Incorrect password was not rejected.');

    const login = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '#1Billion' })
    });
    if (!login.ok) throw new Error(`Login failed: ${login.status}`);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Login did not return an auth cookie.');

    const stateResponse = await fetch(`${base}/api/state`, { headers: { Cookie: cookie } });
    if (!stateResponse.ok) throw new Error(`State failed: ${stateResponse.status}`);

    const addRecipient = await fetch(`${base}/api/recipients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'smoke-test@tcgmachines.com' })
    });
    if (!addRecipient.ok) throw new Error(`Recipient add failed: ${addRecipient.status}`);
    const addedState = await addRecipient.json();
    const recipient = addedState.recipients.find((item) => item.email === 'smoke-test@tcgmachines.com');
    if (!recipient) throw new Error('Recipient was not returned after storage.');

    const disableRecipient = await fetch(`${base}/api/recipients/${recipient.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: false })
    });
    if (!disableRecipient.ok) throw new Error(`Recipient toggle failed: ${disableRecipient.status}`);

    const reenableRecipient = await fetch(`${base}/api/recipients/${recipient.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: true })
    });
    if (!reenableRecipient.ok) throw new Error(`Recipient re-enable failed: ${reenableRecipient.status}`);

    const testEmail = await fetch(`${base}/api/test-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie }
    });
    if (!testEmail.ok) throw new Error(`Test email failed: ${testEmail.status}`);
    const emailResult = await testEmail.json();
    if (emailResult.recipientCount !== 1) throw new Error('Test email recipient count was not 1.');

    for (const file of ['/', '/styles.css', '/client.js', '/tcg-machines-logo.jpeg', '/phyzbatch-wizard.webp']) {
      const response = await fetch(`${base}${file}`);
      if (!response.ok) throw new Error(`Root file failed to load: ${file}`);
    }

    const index = await fetch(base);
    const html = await index.text();
    if (!html.includes('1 Billion Monitor')) throw new Error('Root index.html did not load.');
    if (html.includes('/assets/')) throw new Error('Root index.html still references an assets folder.');

    console.log('Smoke test passed: login, API protection, recipient add/toggle, test email, root assets, and root UI.');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(resolve, 3000).unref();
    });
    fs.rmSync(temp, { recursive: true, force: true });
    if (child.exitCode && child.exitCode !== 0) console.error(output);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
