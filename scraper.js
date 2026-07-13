const { chromium } = require('playwright');
const { parseCounter, parseCounterNearLabel } = require('./counter-parser');

const NETWORK_KEYWORDS = ['phyzbatched', 'cards phyzbatched', 'phyz', 'counter'];

async function readCounterFromFrame(frame, settings) {
  if (settings.counterSelector) {
    const locator = frame.locator(settings.counterSelector).first();
    if (await locator.count()) {
      const text = await locator.innerText().catch(() => locator.textContent());
      const value = parseCounter(text);
      if (value !== null) {
        return { value, source: `CSS selector: ${settings.counterSelector}`, confidence: 'high' };
      }
    }
  }

  const label = settings.counterLabel || 'Cards PhyzBatched';
  const labelLocator = frame.getByText(label, { exact: false }).first();
  if (await labelLocator.count()) {
    const nearbyText = await labelLocator.evaluate((element) => {
      const nodes = [
        element,
        element.previousElementSibling,
        element.nextElementSibling,
        element.parentElement,
        element.parentElement?.previousElementSibling,
        element.parentElement?.nextElementSibling,
        element.parentElement?.parentElement
      ].filter(Boolean);
      return [...new Set(nodes.map((node) => (node.innerText || node.textContent || '').trim()))]
        .filter((text) => text && text.length < 5000)
        .join(' | ');
    });
    const value = parseCounterNearLabel(nearbyText, label);
    if (value !== null) {
      return { value, source: `Text near “${label}”`, confidence: 'high' };
    }
  }

  const bodyText = await frame.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const labelIndex = bodyText.toLowerCase().indexOf(label.toLowerCase());
  if (labelIndex >= 0) {
    const slice = bodyText.slice(Math.max(0, labelIndex - 500), labelIndex + 1000);
    const value = parseCounterNearLabel(slice, label);
    if (value !== null) {
      return { value, source: 'Rendered page text near counter label', confidence: 'high' };
    }
  }

  return null;
}

class LiveCounterScraper {
  constructor({ config, getSettings, onReading, onStatus, onError }) {
    this.config = config;
    this.getSettings = getSettings;
    this.onReading = onReading;
    this.onStatus = onStatus;
    this.onError = onError;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.timer = null;
    this.running = false;
    this.reading = false;
    this.loadedUrl = null;
    this.lastReloadAt = 0;
    this.forceReloadRequested = false;
    this.failureCount = 0;
    this.networkCandidates = [];
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.onStatus('starting', 'Starting the live browser monitor');
    await this.#tick('startup');
  }

  async stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.#closeBrowser();
  }

  async forceCheck({ reload = true } = {}) {
    this.forceReloadRequested = reload;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.reading) return;
    await this.#tick('manual');
  }

  async #tick(trigger) {
    if (!this.running || this.reading) return;
    this.reading = true;

    try {
      if (this.config.disableScraper) {
        this.onStatus('disabled', 'Scraper disabled by DISABLE_SCRAPER');
        return;
      }

      await this.#ensurePage();
      const settings = this.getSettings();
      const reloadMs = Math.max(5, Number(settings.pageReloadSeconds || 30)) * 1000;
      const shouldReload = this.forceReloadRequested || Date.now() - this.lastReloadAt >= reloadMs;

      if (shouldReload) {
        this.onStatus('connecting', 'Refreshing the TCG Machines page');
        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        await this.page.waitForTimeout(1200);
        this.lastReloadAt = Date.now();
        this.forceReloadRequested = false;
      }

      const result = await this.#readCounter(settings);
      if (result.value === null) {
        throw new Error('The Cards PhyzBatched number was not found. Add the exact counter CSS selector in Advanced Settings.');
      }

      this.failureCount = 0;
      this.onStatus('connected', 'Live counter connected');
      await this.onReading({ ...result, trigger });
    } catch (error) {
      this.failureCount += 1;
      this.onStatus('reconnecting', error.message);
      await this.onError(error, trigger);
      this.forceReloadRequested = true;
      if (this.page?.isClosed()) await this.#closeBrowser();
    } finally {
      this.reading = false;
      if (this.running) this.#scheduleNext();
    }
  }

  #scheduleNext() {
    const normalInterval = Math.max(250, Number(this.getSettings().checkIntervalMs || 250));
    const retryInterval = Math.min(30000, 1500 * Math.max(1, this.failureCount));
    const interval = this.failureCount ? retryInterval : normalInterval;
    this.timer = setTimeout(() => this.#tick('automatic'), interval);
    this.timer.unref?.();
  }

  async #ensurePage() {
    const settings = this.getSettings();
    const targetUrl = settings.targetUrl;

    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: this.config.browserHeadless,
        executablePath: this.config.chromiumExecutablePath,
        args: [
          '--disable-dev-shm-usage',
          ...(process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : [])
        ]
      });
      this.context = null;
      this.page = null;
    }

    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: { width: 1440, height: 1000 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      });
      await this.context.route('**/*', async (route) => {
        const type = route.request().resourceType();
        if (['image', 'media', 'font'].includes(type)) return route.abort();
        return route.continue();
      });
    }

    if (!this.page || this.page.isClosed()) {
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(10000);
      this.loadedUrl = null;
      this.networkCandidates = [];
      this.#attachNetworkObservers(this.page);
      this.page.on('crash', () => {
        this.forceReloadRequested = true;
        this.loadedUrl = null;
      });
    }

    if (this.loadedUrl !== targetUrl) {
      this.onStatus('connecting', 'Opening the TCG Machines counter page');
      await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.page.waitForTimeout(1800);
      this.loadedUrl = targetUrl;
      this.lastReloadAt = Date.now();
    }
  }

  #attachNetworkObservers(page) {
    page.on('response', async (response) => {
      try {
        const contentType = String(response.headers()['content-type'] || '').toLowerCase();
        if (!contentType.includes('json') && !contentType.includes('text')) return;
        const length = Number(response.headers()['content-length'] || 0);
        if (length > 750000) return;
        const text = await response.text();
        this.#captureNetworkCandidate(text, `Network response: ${response.url()}`);
      } catch (_) {
        // Some streaming or cross-origin responses cannot be read. Ignore them.
      }
    });

    page.on('websocket', (socket) => {
      socket.on('framereceived', (event) => {
        const payload = Buffer.isBuffer(event.payload) ? event.payload.toString('utf8') : String(event.payload || '');
        this.#captureNetworkCandidate(payload, `WebSocket: ${socket.url()}`);
      });
    });
  }

  #captureNetworkCandidate(text, source) {
    const payload = String(text || '');
    const lowered = payload.toLowerCase();
    const settings = this.getSettings();
    const label = String(settings.counterLabel || 'Cards PhyzBatched');
    const exactLabel = label.toLowerCase();

    if (!NETWORK_KEYWORDS.some((keyword) => lowered.includes(keyword))) return;

    // Prefer a number beside the configured label. When the payload uses a
    // compact JSON key such as cardsPhyzbatched, anchor the search to "phyz"
    // rather than taking the largest number in the entire response. This
    // avoids mistaking a target value or timestamp for the live counter.
    const anchor = lowered.includes(exactLabel) ? label : 'phyz';
    const value = parseCounterNearLabel(payload, anchor);
    if (value === null) return;

    this.networkCandidates.unshift({ value, source, at: Date.now() });
    this.networkCandidates = this.networkCandidates
      .filter((candidate) => Date.now() - candidate.at < 120000)
      .slice(0, 20);
  }

  async #readCounter(settings) {
    for (const frame of this.page.frames()) {
      const fromFrame = await this.#readFrame(frame, settings).catch(() => null);
      if (fromFrame?.value !== null && fromFrame?.value !== undefined) return fromFrame;
    }

    const currentNetwork = this.networkCandidates.find((candidate) => Date.now() - candidate.at < 120000);
    if (currentNetwork) {
      return { value: currentNetwork.value, source: currentNetwork.source, confidence: 'medium' };
    }

    return { value: null, source: 'Counter not found', confidence: 'low' };
  }

  async #readFrame(frame, settings) {
    return readCounterFromFrame(frame, settings);
  }

  async #closeBrowser() {
    try {
      await this.context?.close();
    } catch (_) {
      // Ignore cleanup errors.
    }
    try {
      await this.browser?.close();
    } catch (_) {
      // Ignore cleanup errors.
    }
    this.browser = null;
    this.context = null;
    this.page = null;
    this.loadedUrl = null;
    this.networkCandidates = [];
  }
}

module.exports = { LiveCounterScraper, readCounterFromFrame };
