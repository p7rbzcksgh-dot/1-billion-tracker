require('dotenv').config();

const crypto = require('crypto');
const http = require('http');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { loadConfig } = require('./config');
const {
  secureEqual,
  createToken,
  isAuthenticatedRequest,
  setAuthCookie,
  clearAuthCookie,
  createAuthMiddleware
} = require('./auth');
const { MonitorDatabase } = require('./db');
const { MonitorStore } = require('./store');
const { LiveCounterScraper } = require('./scraper');
const { smtpConfigured, enabledRecipients, sendAnnouncement } = require('./mailer');
const { createSocketHub } = require('./socket');
const { shouldAttemptMilestone } = require('./alert');

const ROOT = __dirname;
const config = loadConfig(ROOT);
const database = new MonitorDatabase(config.dbPath, config);
const store = new MonitorStore(database);
const app = express();
const server = http.createServer(app);
const startedAt = Date.now();
const loginAttempts = new Map();
let shuttingDown = false;
let socketHub;

function publicState() {
  const state = store.get();
  return {
    ...state,
    smtpConfigured: smtpConfigured(),
    enabledRecipientCount: enabledRecipients(state).length,
    serverUptimeSeconds: Math.floor((Date.now() - startedAt) / 1000)
  };
}

function broadcastState() {
  socketHub?.broadcastState();
}

function log(type, message) {
  store.log(type, message);
  socketHub?.broadcast({ type: 'log', payload: { type, message, at: new Date().toISOString() } });
}

function loginAllowed(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > record.resetAt) {
    loginAttempts.delete(ip);
    return true;
  }
  return record.count < 10;
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  record.count += 1;
  loginAttempts.set(ip, record);
}

async function maybeSendMilestoneAlert() {
  const state = store.get();
  if (!shouldAttemptMilestone(state)) return;

  store.mutate((draft) => {
    draft.alertSending = true;
    draft.alertLastAttemptAt = new Date().toISOString();
    draft.lastError = null;
  }, { immediate: true });
  broadcastState();

  try {
    const result = await sendAnnouncement(store.get());
    store.mutate((draft) => {
      draft.alertSending = false;
      draft.alertSent = true;
      draft.alertSentAt = new Date().toISOString();
    }, { immediate: true });
    log('alert', `One-billion-card email sent to ${result.recipientCount} recipients.`);
    socketHub?.broadcast({ type: 'celebration', payload: { counter: store.get().counter } });
    broadcastState();
  } catch (error) {
    store.mutate((draft) => {
      draft.alertSending = false;
      draft.lastError = `Milestone email failed: ${error.message}`;
    }, { immediate: true });
    log('error', `Milestone reached, but email delivery failed: ${error.message}`);
    broadcastState();
  }
}

const scraper = new LiveCounterScraper({
  config,
  getSettings: () => store.get().settings,
  onStatus: (status, message) => {
    const state = store.get();
    const changed = state.monitorStatus !== status;
    store.mutate((draft) => {
      draft.monitorStatus = status;
      if (status === 'connected') draft.lastError = null;
      else if (status === 'reconnecting') draft.lastError = message;
    });
    if (changed) broadcastState();
  },
  onReading: async ({ value, source, confidence, trigger }) => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const current = Number(store.get().counter || 0);
    const target = Number(store.get().settings.alertTarget || 1000000000);
    const regression = current > 0 && Number(value) < current;
    let counterChanged = false;
    let firstMilestoneConfirmation = false;

    store.mutate((draft) => {
      if (draft.checksDate !== today) {
        draft.checksDate = today;
        draft.checksToday = 0;
      }
      draft.checksToday += 1;
      draft.checksTotal += 1;
      draft.lastCheckedAt = now.toISOString();
      draft.lastSuccessAt = now.toISOString();
      draft.source = source;
      draft.consecutiveFailures = 0;
      draft.monitorStatus = 'connected';

      if (regression) {
        draft.lastError = `Ignored a lower counter reading (${Number(value).toLocaleString('en-CA')}) because this total should only increase.`;
        draft.milestoneConfirmations = 0;
        return;
      }

      draft.lastError = null;
      if (Number(draft.counter) !== Number(value)) {
        draft.previousCounter = Number(draft.counter || 0);
        draft.counter = Number(value);
        draft.lastChangedAt = now.toISOString();
        counterChanged = true;
      }

      if (value >= target && confidence !== 'low' && !draft.alertSent && !draft.alertSending) {
        firstMilestoneConfirmation = draft.milestoneConfirmations === 0;
        draft.milestoneConfirmations = Math.min(3, draft.milestoneConfirmations + 1);
      } else if (value < target) {
        draft.milestoneConfirmations = 0;
      }
    }, { immediate: counterChanged || firstMilestoneConfirmation });

    if (regression) {
      if (store.get().checksTotal % 20 === 0) log('warning', store.get().lastError);
    } else if (counterChanged) {
      log('counter', `${trigger} reading updated to ${Number(value).toLocaleString('en-CA')} cards.`);
    }

    broadcastState();
    await maybeSendMilestoneAlert();
  },
  onError: async (error, trigger) => {
    store.mutate((draft) => {
      draft.lastCheckedAt = new Date().toISOString();
      draft.lastError = error.message;
      draft.consecutiveFailures += 1;
      draft.monitorStatus = 'reconnecting';
    });
    const failures = store.get().consecutiveFailures;
    if (failures === 1 || failures % 10 === 0) {
      log('error', `${trigger} counter check failed: ${error.message}`);
    }
    broadcastState();
  }
});

app.set('trust proxy', config.trustProxy ? 1 : false);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '100kb' }));

app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/styles.css', (_req, res) => res.sendFile(path.join(ROOT, 'styles.css')));
app.get('/client.js', (_req, res) => res.sendFile(path.join(ROOT, 'client.js')));
app.get('/tcg-machines-logo.jpeg', (_req, res) => res.sendFile(path.join(ROOT, 'tcg-machines-logo.jpeg'), { maxAge: '7d', immutable: true }));
app.get('/phyzbatch-wizard.webp', (_req, res) => res.sendFile(path.join(ROOT, 'phyzbatch-wizard.webp'), { maxAge: '7d', immutable: true }));
app.get('/favicon.ico', (_req, res) => res.status(204).end());

app.get('/api/session', (req, res) => {
  res.json({ authenticated: isAuthenticatedRequest(req, config.cookieSecret) });
});

app.post('/api/login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!loginAllowed(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes and try again.' });
  }

  if (!secureEqual(req.body?.password || '', config.appPassword)) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  loginAttempts.delete(ip);
  setAuthCookie(res, createToken(config.cookieSecret), config.cookieSecure);
  return res.json({ ok: true });
});

const auth = createAuthMiddleware(config.cookieSecret);

app.post('/api/logout', auth, (_req, res) => {
  clearAuthCookie(res, config.cookieSecure);
  res.json({ ok: true });
});

app.get('/api/state', auth, (_req, res) => {
  res.json(publicState());
});

app.post('/api/check', auth, (_req, res) => {
  scraper.forceCheck({ reload: true }).catch((error) => log('error', `Manual check failed: ${error.message}`));
  res.json({ ok: true, message: 'Manual refresh started.' });
});

app.post('/api/recipients', auth, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (store.get().recipients.length >= 200) {
    return res.status(400).json({ error: 'Maximum 200 recipients.' });
  }
  if (store.get().recipients.some((recipient) => recipient.email.toLowerCase() === email)) {
    return res.status(409).json({ error: 'That email is already on the list.' });
  }

  const recipients = [...store.get().recipients, {
    id: crypto.randomUUID(),
    email,
    enabled: true,
    createdAt: new Date().toISOString()
  }];
  store.setRecipients(recipients);
  log('settings', `Added ${email} to the alert list.`);
  broadcastState();
  res.status(201).json(publicState());
});

app.patch('/api/recipients/:id', auth, (req, res) => {
  if (typeof req.body?.enabled !== 'boolean') {
    return res.status(400).json({ error: 'The enabled value must be true or false.' });
  }
  const recipients = store.get().recipients.map((recipient) =>
    recipient.id === req.params.id
      ? { ...recipient, enabled: req.body.enabled }
      : recipient
  );
  if (!recipients.some((recipient) => recipient.id === req.params.id)) {
    return res.status(404).json({ error: 'Recipient not found.' });
  }
  store.setRecipients(recipients);
  broadcastState();
  res.json(publicState());
});

app.delete('/api/recipients/:id', auth, (req, res) => {
  const existing = store.get().recipients.find((recipient) => recipient.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Recipient not found.' });
  store.setRecipients(store.get().recipients.filter((recipient) => recipient.id !== req.params.id));
  log('settings', `Removed ${existing.email} from the alert list.`);
  broadcastState();
  res.json(publicState());
});

app.post('/api/test-email', auth, async (_req, res) => {
  try {
    const result = await sendAnnouncement(store.get(), { test: true });
    log('email', `Test email sent to ${result.recipientCount} recipients.`);
    res.json({ ok: true, recipientCount: result.recipientCount });
  } catch (error) {
    log('error', `Test email failed: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/settings', auth, (req, res) => {
  const incoming = req.body || {};
  let targetUrl;
  try {
    targetUrl = new URL(String(incoming.targetUrl || store.get().settings.targetUrl));
    if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error('bad protocol');
  } catch (_) {
    return res.status(400).json({ error: 'Enter a valid http or https website URL.' });
  }

  store.mutate((draft) => {
    draft.settings.targetUrl = targetUrl.toString();
    draft.settings.counterSelector = String(incoming.counterSelector || '').trim().slice(0, 300);
    draft.settings.counterLabel = String(incoming.counterLabel || 'Cards PhyzBatched').trim().slice(0, 100);
    draft.settings.checkIntervalMs = Math.min(60000, Math.max(250, Number(incoming.checkIntervalMs || 250)));
    draft.settings.pageReloadSeconds = Math.min(3600, Math.max(5, Number(incoming.pageReloadSeconds || 30)));
    draft.settings.alertTarget = 1000000000;
    draft.settings.emailSubject = String(incoming.emailSubject || draft.settings.emailSubject).trim().slice(0, 200);
    draft.settings.emailBody = String(incoming.emailBody || draft.settings.emailBody).trim().slice(0, 4000);
  }, { immediate: true });
  log('settings', 'Monitor settings updated.');
  scraper.forceCheck({ reload: true }).catch(() => {});
  broadcastState();
  res.json(publicState());
});

app.post('/api/reset-alert', auth, (_req, res) => {
  store.mutate((draft) => {
    draft.alertSent = false;
    draft.alertSentAt = null;
    draft.alertSending = false;
    draft.alertLastAttemptAt = null;
    draft.milestoneConfirmations = 0;
  }, { immediate: true });
  log('settings', 'One-billion alert lock reset manually.');
  broadcastState();
  res.json(publicState());
});

app.get('/health', (_req, res) => {
  const state = store.get();
  res.json({
    ok: true,
    status: state.monitorStatus,
    counter: state.counter,
    lastSuccessAt: state.lastSuccessAt,
    smtpConfigured: smtpConfigured(),
    alertSent: state.alertSent
  });
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'The monitor encountered an unexpected server error.' });
});

socketHub = createSocketHub(server, {
  authenticate: (request) => isAuthenticatedRequest(request, config.cookieSecret),
  getState: publicState
});

server.listen(config.port, config.host, () => {
  console.log(`TCG 1 Billion Monitor running on ${config.host}:${config.port}`);
  scraper.start().catch((error) => log('error', `Scraper startup failed: ${error.message}`));
  if (store.get().alertSending && !store.get().alertSent) {
    log('warning', 'The app restarted while a milestone email was marked as sending. The lock remains active to prevent a duplicate send; reset it manually only after checking delivery.');
  }
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received. Shutting down...`);
  try {
    await scraper.stop();
    await socketHub.close();
    store.close();
  } finally {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  console.error(error);
  log('error', `Uncaught exception: ${error.message}`);
});
process.on('unhandledRejection', (error) => {
  console.error(error);
  log('error', `Unhandled rejection: ${error?.message || error}`);
});
