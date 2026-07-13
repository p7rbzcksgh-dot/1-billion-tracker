const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MonitorDatabase } = require('./db');
const { MonitorStore } = require('./store');

function defaults() {
  return {
    targetUrl: 'https://www.tcgmachines.com/',
    counterLabel: 'Cards PhyzBatched',
    counterSelector: '',
    readIntervalMs: 500,
    fullRefreshSeconds: 30
  };
}

test('SQLite state, recipients and logs persist across reopen', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcg-db-test-'));
  const dbPath = path.join(dir, 'monitor.sqlite');

  try {
    let database = new MonitorDatabase(dbPath, defaults());
    let store = new MonitorStore(database);
    store.mutate((state) => {
      state.counter = 612345678;
      state.monitorStatus = 'connected';
    }, { immediate: true });
    store.setRecipients([{ id: 'one', email: 'team@tcgmachines.com', enabled: true, createdAt: new Date().toISOString() }]);
    store.log('counter', 'Updated');
    store.close();

    database = new MonitorDatabase(dbPath, defaults());
    store = new MonitorStore(database);
    assert.equal(store.get().counter, 612345678);
    assert.equal(store.get().monitorStatus, 'connected');
    assert.equal(store.get().recipients.length, 1);
    assert.equal(store.get().recipients[0].email, 'team@tcgmachines.com');
    assert.equal(store.get().logs[0].message, 'Updated');
    store.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
