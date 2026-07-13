const crypto = require('crypto');
const path = require('path');

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function loadConfig(rootDir) {
  const production = process.env.NODE_ENV === 'production';
  const appPassword = process.env.APP_PASSWORD || '#1Billion';
  const fallbackSecret = crypto
    .createHash('sha256')
    .update(`tcg-one-billion-monitor:${appPassword}`)
    .digest('hex');

  return {
    rootDir,
    host: process.env.HOST || '0.0.0.0',
    port: toNumber(process.env.PORT, 3000, { min: 1, max: 65535 }),
    appPassword,
    cookieSecret: process.env.COOKIE_SECRET || fallbackSecret,
    cookieSecure: toBoolean(process.env.COOKIE_SECURE, production),
    trustProxy: toBoolean(process.env.TRUST_PROXY, production),
    dbPath: path.resolve(rootDir, process.env.DB_PATH || './tcg-monitor.sqlite'),
    targetUrl: process.env.TARGET_URL || 'https://www.tcgmachines.com/',
    counterLabel: process.env.COUNTER_LABEL || 'Cards PhyzBatched',
    counterSelector: process.env.COUNTER_SELECTOR || '',
    readIntervalMs: toNumber(process.env.READ_INTERVAL_MS, 250, { min: 250, max: 60000 }),
    fullRefreshSeconds: toNumber(process.env.FULL_REFRESH_SECONDS, 30, { min: 5, max: 3600 }),
    browserHeadless: toBoolean(process.env.BROWSER_HEADLESS, true),
    chromiumExecutablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    disableScraper: toBoolean(process.env.DISABLE_SCRAPER, false),
    mailStreamMode: toBoolean(process.env.MAIL_STREAM_MODE, false)
  };
}

module.exports = { loadConfig, toBoolean, toNumber };
