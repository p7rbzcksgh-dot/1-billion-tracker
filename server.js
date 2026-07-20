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
const { teamsPreferences, teamsEnabled, teamsConfigured, sendTeamsPost } = require('./teams');
const { createSocketHub } = require('./socket');
const {
  dueMilestonesForChannel,
  updateMilestoneConfirmations,
  MILESTONES,
  resetMilestoneAlerts,
  publicMilestones,
  nextUnsentMilestone
} = require('./alert');

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
let milestoneProcessorActive = false;

function publicState() {
  const state = store.get();
  const milestones = publicMilestones(state);
  const teams = teamsPreferences();
  const teamsMilestones = milestones.filter(
    (milestone) => milestone.final ? teams.notifyFinal : teams.notifyCountdown
  );
  const teamsMilestoneTotal = teamsMilestones.length;

  return {
    ...state,
    milestones,
    nextMilestone: nextUnsentMilestone(state),

    milestoneEmailsSent: milestones.filter((milestone) => milestone.emailSent).length,
    milestoneEmailsTotal: milestones.length,
    milestoneEmailSending: milestones.some((milestone) => milestone.emailSending),

    milestoneTeamsSent: teamsMilestones.filter((milestone) => milestone.teamsSent).length,
    milestoneTeamsTotal: teamsMilestoneTotal,
    milestoneTeamsSending: milestones.some((milestone) => milestone.teamsSending),

    smtpConfigured: smtpConfigured(),
    enabledRecipientCount: enabledRecipients(state).length,

    teamsEnabled: teamsEnabled(),
    teamsConfigured: teamsConfigured(),
    teamsNotifyCountdown: teams.notifyCountdown,
    teamsNotifyFinal: teams.notifyFinal,

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

async function processEmailMilestones() {
  if (!smtpConfigured() || enabledRecipients(store.get()).length === 0) return;

  while (true) {
    const milestone = dueMilestonesForChannel(store.get(), 'email')[0];
    if (!milestone) break;
    const attemptAt = new Date().toISOString();

    store.mutate((draft) => {
      const status = draft.milestoneAlerts[milestone.id];
      status.emailSending = true;
      status.emailLastAttemptAt = attemptAt;
      status.emailLastError = null;
      draft.lastError = null;

      if (milestone.final) {
        draft.alertSending = true;
        draft.alertLastAttemptAt = attemptAt;
      }
    }, { immediate: true });
    broadcastState();

    try {
      const result = await sendAnnouncement(store.get(), { milestone });
      const sentAt = new Date().toISOString();
      store.mutate((draft) => {
        const status = draft.milestoneAlerts[milestone.id];
        status.emailSending = false;
        status.emailSent = true;
        status.emailSentAt = sentAt;
        status.emailLastError = null;

        if (milestone.final) {
          draft.alertSending = false;
          draft.alertSent = true;
          draft.alertSentAt = sentAt;
        }
      }, { immediate: true });

      log('alert', `${milestone.label} email sent once to ${result.recipientCount} enabled recipients.`);
      if (milestone.final) {
        socketHub?.broadcast({ type: 'celebration', payload: { counter: store.get().counter } });
      }
      broadcastState();
    } catch (error) {
      store.mutate((draft) => {
        const status = draft.milestoneAlerts[milestone.id];
        status.emailSending = false;
        status.emailLastError = error.message;
        draft.lastError = `${milestone.label} email failed: ${error.message}`;

        if (milestone.final) {
          draft.alertSending = false;
        }
      }, { immediate: true });
      log('error', `${milestone.label} reached, but email delivery failed: ${error.message}`);
      broadcastState();
      break;
    }
  }
}

function teamsMilestoneEnabled(milestone, preferences) {
  return milestone.final ? preferences.notifyFinal : preferences.notifyCountdown;
}

async function processTeamsMilestones() {
  const preferences = teamsPreferences();
  if (!teamsConfigured()) return;

  while (true) {
    const milestone = dueMilestonesForChannel(store.get(), 'teams')
      .find((candidate) => teamsMilestoneEnabled(candidate, preferences));
    if (!milestone) break;
    const attemptAt = new Date().toISOString();

    store.mutate((draft) => {
      const status = draft.milestoneAlerts[milestone.id];
      status.teamsSending = true;
      status.teamsLastAttemptAt = attemptAt;
      status.teamsLastError = null;
      draft.lastError = null;
    }, { immediate: true });
    broadcastState();

    try {
      await sendTeamsPost(store.get(), { milestone });
      const sentAt = new Date().toISOString();
      store.mutate((draft) => {
        const status = draft.milestoneAlerts[milestone.id];
        status.teamsSending = false;
        status.teamsSent = true;
        status.teamsSentAt = sentAt;
        status.teamsLastError = null;
      }, { immediate: true });

      log('teams', `${milestone.label} posted once to Microsoft Teams.`);
      if (milestone.final) {
        socketHub?.broadcast({ type: 'celebration', payload: { counter: store.get().counter } });
      }
      broadcastState();
    } catch (error) {
      store.mutate((draft) => {
        const status = draft.milestoneAlerts[milestone.id];
        status.teamsSending = false;
        status.teamsLastError = error.message;
        draft.lastError = `${milestone.label} Teams post failed: ${error.message}`;
      }, { immediate: true });
      log('error', `${milestone.label} reached, but Microsoft Teams delivery failed: ${error.message}`);
      broadcastState();
      break;
    }
  }
}

async function maybeDeliverMilestoneAlerts() {
  if (milestoneProcessorActive) return;
  milestoneProcessorActive = true;

  try {
    // Email and Teams have independent sent locks. A failure in one channel
    // never blocks or marks the other channel as delivered.
    await processEmailMilestones();
    await processTeamsMilestones();
  } finally {
    milestoneProcessorActive = false;
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
    const regression = current > 0 && Number(value) < current;
    let counterChanged = false;
    let milestoneConfirmationsChanged = false;

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

      milestoneConfirmationsChanged = updateMilestoneConfirmations(draft, value, confidence);
    }, { immediate: counterChanged || milestoneConfirmationsChanged });

    if (regression) {
      if (store.get().checksTotal % 20 === 0) log('warning', store.get().lastError);
    } else if (counterChanged) {
      log('counter', `${trigger} reading updated to ${Number(value).toLocaleString('en-CA')} cards.`);
    }

    broadcastState();
    await maybeDeliverMilestoneAlerts();
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

app.post('/api/test-teams', auth, async (_req, res) => {
  try {
    const result = await sendTeamsPost(store.get(), { test: true });
    log('teams', 'Microsoft Teams test post delivered successfully.');
    res.json({ ok: true, status: result.status, simulated: result.simulated });
  } catch (error) {
    log('error', `Microsoft Teams test failed: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/settings', auth, (req, res) => {
  const incoming = req.body || {};

  store.mutate((draft) => {
    // The source is intentionally fixed. The app may only read the live
    // Cards PhyzBatched counter from tcgmachines.com/product.
    draft.settings.targetUrl = config.targetUrl;
    draft.settings.counterLabel = config.counterLabel;
    draft.settings.counterSelector = String(incoming.counterSelector || '').trim().slice(0, 300);
    draft.settings.checkIntervalMs = Math.min(60000, Math.max(250, Number(incoming.checkIntervalMs || 500)));
    draft.settings.pageReloadSeconds = Math.min(3600, Math.max(5, Number(incoming.pageReloadSeconds || 30)));
    draft.settings.alertTarget = 1000000000;
    draft.settings.emailSubject = String(incoming.emailSubject || draft.settings.emailSubject).trim().slice(0, 200);
    draft.settings.emailBody = String(incoming.emailBody || draft.settings.emailBody).trim().slice(0, 4000);
  }, { immediate: true });
  log('settings', 'Monitor settings updated. Source remains locked to tcgmachines.com/product.');
  scraper.forceCheck({ reload: true }).catch(() => {});
  broadcastState();
  res.json(publicState());
});

app.post('/api/reset-alert', auth, (_req, res) => {
  store.mutate((draft) => {
    draft.milestoneAlerts = resetMilestoneAlerts();
    draft.alertSent = false;
    draft.alertSentAt = null;
    draft.alertSending = false;
    draft.alertLastAttemptAt = null;
    draft.milestoneConfirmations = 0;
  }, { immediate: true });
  log('settings', 'All countdown and final email and Microsoft Teams delivery locks were reset manually.');
  broadcastState();
  res.json(publicState());
});

// Railway calls this during deployment. It deliberately reports server readiness
// independently of scraper success so a temporary website or browser issue cannot
// cause the entire web service deployment to fail.
app.get('/healthz', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'tcg-one-billion-monitor',
    version: '1.9.1',
    milestoneCount: MILESTONES.length,
    countdownRemaining: MILESTONES.filter((milestone) => !milestone.final).map((milestone) => milestone.remaining),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000)
  });
});

app.get('/health', (_req, res) => {
  const state = store.get();
  res.json({
    ok: true,
    status: state.monitorStatus,
    counter: state.counter,
    lastSuccessAt: state.lastSuccessAt,
    smtpConfigured: smtpConfigured(),
    teamsConfigured: teamsConfigured(),
    alertSent: state.alertSent,
    milestoneEmailsSent: publicMilestones(state).filter((milestone) => milestone.emailSent).length,
    milestoneTeamsSent: publicMilestones(state).filter((milestone) => milestone.teamsSent).length,
    databasePath: config.dbPath
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
  console.log(`TCG 1 Billion Monitor v1.9.1 listening on ${config.host}:${config.port}`);
  console.log(`Database: ${config.dbPath}`);
  console.log(`Scraper starts in ${config.scraperStartDelayMs} ms`);

  const scraperTimer = setTimeout(() => {
    scraper.start().catch((error) => log('error', `Scraper startup failed: ${error.message}`));
  }, config.scraperStartDelayMs);
  scraperTimer.unref?.();

  const currentMilestones = publicMilestones(store.get());
  const interruptedEmail = currentMilestones.filter((milestone) => milestone.emailSending && !milestone.emailSent);
  const interruptedTeams = currentMilestones.filter((milestone) => milestone.teamsSending && !milestone.teamsSent);

  if (interruptedEmail.length) {
    log('warning', `The app restarted while ${interruptedEmail.map((milestone) => milestone.label).join(', ')} email delivery was marked as active. Check delivery before resetting locks.`);
  }
  if (interruptedTeams.length) {
    log('warning', `The app restarted while ${interruptedTeams.map((milestone) => milestone.label).join(', ')} Microsoft Teams delivery was marked as active. Check the Teams chat or channel before resetting locks.`);
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
