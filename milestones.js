const TARGET = 1_000_000_000;

// Default countdown schedule. Railway can override this without editing code by
// setting MILESTONE_REMAINING to plain whole numbers separated by commas.
const DEFAULT_MILESTONE_REMAINING = Object.freeze([
  10_000_000,
  5_000_000,
  2_000_000,
  500_000,
  100_000,
  50_000,
  10_000,
  5_000
]);

function parseMilestoneRemaining(rawValue = process.env.MILESTONE_REMAINING) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return [...DEFAULT_MILESTONE_REMAINING];
  }

  let candidates;
  const raw = String(rawValue).trim();

  // Also accept a JSON array, which is convenient in Railway's Raw Editor.
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      candidates = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      candidates = [];
    }
  } else {
    candidates = raw.split(/[;,|\n\r\t ]+/);
  }

  const values = [...new Set(candidates
    .map((value) => Number(String(value).trim().replaceAll('_', '')))
    .filter((value) => Number.isSafeInteger(value) && value > 0 && value < TARGET)
  )].sort((a, b) => b - a);

  // A typo must not silently remove every countdown alert.
  return values.length ? values : [...DEFAULT_MILESTONE_REMAINING];
}

function milestoneId(remaining) {
  return `${remaining}-away`;
}

function buildMilestones(remainingValues = parseMilestoneRemaining()) {
  const countdowns = [...new Set(remainingValues
    .map(Number)
    .filter((value) => Number.isSafeInteger(value) && value > 0 && value < TARGET)
  )].sort((a, b) => b - a);

  return Object.freeze([
    ...countdowns.map((remaining) => Object.freeze({
      id: milestoneId(remaining),
      remaining,
      threshold: TARGET - remaining,
      label: `${remaining.toLocaleString('en-CA')} cards away`,
      shortLabel: remaining >= 1_000_000
        ? `${Number((remaining / 1_000_000).toFixed(3))}M to go`
        : remaining >= 1_000
          ? `${Number((remaining / 1_000).toFixed(3))}K to go`
          : `${remaining} to go`,
      final: false
    })),
    Object.freeze({
      id: 'one-billion',
      remaining: 0,
      threshold: TARGET,
      label: '1 billion reached',
      shortLabel: '1 BILLION',
      final: true
    })
  ]);
}

const MILESTONES = buildMilestones();

function emptyStatus() {
  return {
    confirmations: 0,

    emailSent: false,
    emailSentAt: null,
    emailSending: false,
    emailLastAttemptAt: null,
    emailLastError: null,

    teamsSent: false,
    teamsSentAt: null,
    teamsSending: false,
    teamsLastAttemptAt: null,
    teamsLastError: null
  };
}

function normalizeStatus(existing = {}) {
  const input = existing && typeof existing === 'object' ? existing : {};

  // v1.7 and earlier used the unprefixed fields for email. Preserve them
  // during migration so existing Railway volumes do not resend email.
  const emailSent = input.emailSent ?? input.sent ?? false;
  const emailSentAt = input.emailSentAt ?? input.sentAt ?? null;
  const emailSending = input.emailSending ?? input.sending ?? false;
  const emailLastAttemptAt = input.emailLastAttemptAt ?? input.lastAttemptAt ?? null;
  const emailLastError = input.emailLastError ?? input.lastError ?? null;

  return {
    ...emptyStatus(),
    confirmations: Math.max(0, Number(input.confirmations || 0)),

    emailSent: Boolean(emailSent),
    emailSentAt: emailSentAt || null,
    emailSending: Boolean(emailSending),
    emailLastAttemptAt: emailLastAttemptAt || null,
    emailLastError: emailLastError || null,

    teamsSent: Boolean(input.teamsSent),
    teamsSentAt: input.teamsSentAt || null,
    teamsSending: Boolean(input.teamsSending),
    teamsLastAttemptAt: input.teamsLastAttemptAt || null,
    teamsLastError: input.teamsLastError || null
  };
}

function normalizeMilestoneAlerts(value = {}, legacyFinal = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const normalized = {};

  // Preserve locks for milestones that are temporarily removed from the Railway
  // variable. If they are added again later, they do not unexpectedly resend.
  for (const [id, status] of Object.entries(input)) {
    normalized[id] = normalizeStatus(status);
  }

  for (const milestone of MILESTONES) {
    normalized[milestone.id] = normalizeStatus(input[milestone.id]);
  }

  const final = normalized['one-billion'];
  if (legacyFinal.alertSent) final.emailSent = true;
  if (legacyFinal.alertSentAt) final.emailSentAt = legacyFinal.alertSentAt;
  if (legacyFinal.alertSending) final.emailSending = true;
  if (legacyFinal.alertLastAttemptAt) final.emailLastAttemptAt = legacyFinal.alertLastAttemptAt;
  if (legacyFinal.milestoneConfirmations) {
    final.confirmations = Math.max(final.confirmations, Number(legacyFinal.milestoneConfirmations || 0));
  }

  return normalized;
}

function updateMilestoneConfirmations(state, counter, confidence) {
  state.milestoneAlerts = normalizeMilestoneAlerts(state.milestoneAlerts, state);
  let changed = false;

  for (const milestone of MILESTONES) {
    const status = state.milestoneAlerts[milestone.id];

    if (Number(counter) >= milestone.threshold && confidence !== 'low') {
      const next = Math.min(3, Number(status.confirmations || 0) + 1);
      if (next !== status.confirmations) {
        status.confirmations = next;
        status.emailLastError = null;
        status.teamsLastError = null;
        changed = true;
      }
    } else if (Number(counter) < milestone.threshold && status.confirmations !== 0) {
      status.confirmations = 0;
      changed = true;
    }
  }

  const final = state.milestoneAlerts['one-billion'];
  state.milestoneConfirmations = Number(final.confirmations || 0);
  return changed;
}

function channelFields(channel) {
  if (channel === 'teams') {
    return {
      sent: 'teamsSent',
      sentAt: 'teamsSentAt',
      sending: 'teamsSending',
      lastAttemptAt: 'teamsLastAttemptAt',
      lastError: 'teamsLastError'
    };
  }
  return {
    sent: 'emailSent',
    sentAt: 'emailSentAt',
    sending: 'emailSending',
    lastAttemptAt: 'emailLastAttemptAt',
    lastError: 'emailLastError'
  };
}

function shouldAttemptDelivery(state, milestone, channel = 'email', now = Date.now()) {
  const status = normalizeMilestoneAlerts(state.milestoneAlerts, state)[milestone.id];
  const fields = channelFields(channel);

  if (!status || status[fields.sent] || status[fields.sending]) return false;
  if (Number(state.counter || 0) < milestone.threshold) return false;
  if (Number(status.confirmations || 0) < 2) return false;

  const lastAttempt = status[fields.lastAttemptAt]
    ? Date.parse(status[fields.lastAttemptAt])
    : 0;
  if (lastAttempt && now - lastAttempt < 60_000) return false;
  return true;
}

function dueMilestonesForChannel(state, channel = 'email', now = Date.now()) {
  return MILESTONES
    .filter((milestone) => shouldAttemptDelivery(state, milestone, channel, now))
    .sort((a, b) => b.threshold - a.threshold);
}

// Backward-compatible email aliases used by existing tests and integrations.
function shouldAttemptMilestone(state, milestone, now = Date.now()) {
  return shouldAttemptDelivery(state, milestone, 'email', now);
}

function dueMilestones(state, now = Date.now()) {
  return dueMilestonesForChannel(state, 'email', now);
}

function resetMilestoneAlerts() {
  return normalizeMilestoneAlerts({});
}

function publicMilestones(state) {
  const alerts = normalizeMilestoneAlerts(state.milestoneAlerts, state);
  const counter = Number(state.counter || 0);

  return MILESTONES.map((milestone) => {
    const status = alerts[milestone.id];
    return {
      ...milestone,
      reached: counter >= milestone.threshold,
      confirmations: status.confirmations,

      emailSent: status.emailSent,
      emailSentAt: status.emailSentAt,
      emailSending: status.emailSending,
      emailLastError: status.emailLastError,

      teamsSent: status.teamsSent,
      teamsSentAt: status.teamsSentAt,
      teamsSending: status.teamsSending,
      teamsLastError: status.teamsLastError,

      // v1.7 client compatibility: these aliases refer to email delivery.
      sent: status.emailSent,
      sentAt: status.emailSentAt,
      sending: status.emailSending,
      lastError: status.emailLastError
    };
  });
}

function nextUnsentMilestone(state) {
  return publicMilestones(state).find(
    (milestone) => !milestone.emailSent || !milestone.teamsSent
  ) || null;
}

module.exports = {
  TARGET,
  DEFAULT_MILESTONE_REMAINING,
  MILESTONES,
  parseMilestoneRemaining,
  buildMilestones,
  milestoneId,
  normalizeMilestoneAlerts,
  updateMilestoneConfirmations,
  channelFields,
  shouldAttemptDelivery,
  dueMilestonesForChannel,
  shouldAttemptMilestone,
  dueMilestones,
  resetMilestoneAlerts,
  publicMilestones,
  nextUnsentMilestone
};
