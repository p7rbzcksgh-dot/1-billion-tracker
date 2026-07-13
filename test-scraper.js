const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { readCounterFromFrame } = require('./scraper');

function browserExecutable() {
  const candidates = [
    process.env.CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    chromium.executablePath()
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const executablePath = browserExecutable();

test('extracts the counter from an exact selector', { skip: !executablePath }, async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
  });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <section>
        <span>Cards PhyzBatched</span>
        <strong id="counter"><span>612</span><span>,345</span><span>,678</span></strong>
      </section>
    `);
    const result = await readCounterFromFrame(page.mainFrame(), {
      counterSelector: '#counter',
      counterLabel: 'Cards PhyzBatched'
    });
    assert.equal(result.value, 612345678);
    assert.equal(result.confidence, 'high');
  } finally {
    await browser.close();
  }
});

test('extracts the counter from text near the label without a selector', { skip: !executablePath }, async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: process.getuid?.() === 0 ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
  });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="counter-card">
        <div>Cards PhyzBatched</div>
        <div class="digits">612,345,678</div>
      </div>
    `);
    const result = await readCounterFromFrame(page.mainFrame(), {
      counterSelector: '',
      counterLabel: 'Cards PhyzBatched'
    });
    assert.equal(result.value, 612345678);
    assert.match(result.source, /Text near/);
  } finally {
    await browser.close();
  }
});
