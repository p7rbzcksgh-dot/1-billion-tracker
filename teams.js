const { TARGET } = require('./milestones');

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function teamsPreferences() {
  const webhookUrl = String(process.env.TEAMS_WEBHOOK_URL || '').trim();
  const streamMode = boolValue(process.env.TEAMS_STREAM_MODE, false);
  return {
    enabled: boolValue(process.env.TEAMS_ENABLED, Boolean(webhookUrl) || streamMode),
    webhookUrl,
    streamMode,
    notifyCountdown: boolValue(process.env.TEAMS_NOTIFY_COUNTDOWN, true),
    notifyFinal: boolValue(process.env.TEAMS_NOTIFY_FINAL, true),
    timeoutMs: Math.min(60_000, Math.max(3_000, Number(process.env.TEAMS_REQUEST_TIMEOUT_MS || 20_000)))
  };
}

function teamsEnabled() {
  return teamsPreferences().enabled;
}

function teamsConfigured() {
  const config = teamsPreferences();
  if (!config.enabled) return false;
  if (config.streamMode) return true;
  try {
    const url = new URL(config.webhookUrl);
    return url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-CA');
}

function teamsMessageContent(state, milestone, test = false) {
  const current = Number(state.counter || 0);
  const remaining = Math.max(0, TARGET - current);

  if (test) {
    return {
      title: 'TCG 1 Billion Monitor — Teams test',
      summary: 'Microsoft Teams webhook test from the TCG 1 Billion Monitor.',
      message: 'This test confirms that the Railway app can post directly to this Microsoft Teams chat or channel.',
      accent: 'F47A20',
      statusTitle: 'Current Cards PhyzBatched',
      statusValue: formatNumber(current),
      footer: 'Test only — no milestone delivery locks were changed.'
    };
  }

  if (milestone?.final) {
    return {
      title: '🏆 TCG MACHINES HAS REACHED 1 BILLION CARDS!',
      summary: 'TCG Machines has officially PhyzBatched one billion cards.',
      message: 'The worldwide PhyzBatch fleet has officially processed 1,000,000,000 cards. Congratulations to the entire TCG Machines team!',
      accent: '63C174',
      statusTitle: 'Verified Cards PhyzBatched',
      statusValue: formatNumber(current),
      footer: 'Final one-billion milestone confirmed by two consecutive live readings.'
    };
  }

  const milestoneRemaining = Number(milestone?.remaining || remaining);
  return {
    title: `🔥 ${formatNumber(milestoneRemaining)} CARDS TO GO`,
    summary: `TCG Machines is ${formatNumber(milestoneRemaining)} cards away from one billion.`,
    message: `TCG Machines is now only ${formatNumber(milestoneRemaining)} Cards PhyzBatched away from the one-billion-card milestone.`,
    accent: 'F47A20',
    statusTitle: 'Current verified total',
    statusValue: formatNumber(current),
    footer: 'Countdown milestone confirmed by two consecutive live readings.'
  };
}

function buildTeamsPayload(state, { test = false, milestone = null } = {}) {
  const content = teamsMessageContent(state, milestone, test);
  const verifiedAt = new Date().toLocaleString('en-CA');

  return {
    type: 'message',
    summary: content.summary,
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          msteams: { width: 'Full' },
          body: [
            {
              type: 'TextBlock',
              text: content.title,
              size: 'Large',
              weight: 'Bolder',
              wrap: true,
              color: milestone?.final ? 'Good' : 'Accent'
            },
            {
              type: 'TextBlock',
              text: content.message,
              wrap: true,
              spacing: 'Medium'
            },
            {
              type: 'FactSet',
              facts: [
                { title: content.statusTitle, value: content.statusValue },
                { title: 'Verified', value: verifiedAt },
                { title: 'Source', value: 'tcgmachines.com/product' }
              ]
            },
            {
              type: 'TextBlock',
              text: content.footer,
              wrap: true,
              isSubtle: true,
              size: 'Small',
              spacing: 'Medium'
            }
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'View live Cards PhyzBatched counter',
              url: 'https://tcgmachines.com/product'
            }
          ]
        }
      }
    ]
  };
}

async function sendTeamsPost(
  state,
  {
    test = false,
    milestone = null,
    fetchImpl = globalThis.fetch,
    config: suppliedConfig = null
  } = {}
) {
  const config = suppliedConfig || teamsPreferences();
  if (!config.enabled) {
    throw new Error('Microsoft Teams posting is disabled. Set TEAMS_ENABLED=true in Railway.');
  }

  const payload = buildTeamsPayload(state, { test, milestone });

  if (config.streamMode) {
    return {
      ok: true,
      simulated: true,
      status: 200,
      payload,
      responseText: 'Teams stream-mode test'
    };
  }

  let url;
  try {
    url = new URL(config.webhookUrl);
  } catch (_) {
    throw new Error('TEAMS_WEBHOOK_URL is missing or invalid.');
  }
  if (url.protocol !== 'https:') {
    throw new Error('TEAMS_WEBHOOK_URL must be an HTTPS address.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('This Node runtime does not provide fetch for Teams delivery.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 20_000);
  timeout.unref?.();

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'TCG-1-Billion-Monitor/1.9.1'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const responseText = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(
        `Teams webhook returned HTTP ${response.status}${responseText ? `: ${responseText.slice(0, 300)}` : ''}`
      );
    }

    return {
      ok: true,
      simulated: false,
      status: response.status,
      payload,
      responseText
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Teams webhook timed out after ${config.timeoutMs || 20_000} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  teamsPreferences,
  teamsEnabled,
  teamsConfigured,
  teamsMessageContent,
  buildTeamsPayload,
  sendTeamsPost
};
