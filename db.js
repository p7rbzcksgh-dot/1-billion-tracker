const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_EMAIL_SUBJECT = 'TCG Machines has PhyzBatched 1 BILLION cards!';
const DEFAULT_EMAIL_BODY = [
  'We did it — the worldwide PhyzBatch fleet has officially processed 1,000,000,000 cards.',
  '',
  'Thank you to everyone who helped TCG Machines reach this milestone.'
].join('\n');

class MonitorDatabase {
  constructor(filePath, defaults) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.#createSchema();
    this.#seed(defaults);
  }

  #createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        counter INTEGER NOT NULL DEFAULT 0,
        previous_counter INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'Waiting for first live reading',
        last_checked_at TEXT,
        last_success_at TEXT,
        last_changed_at TEXT,
        last_error TEXT,
        monitor_status TEXT NOT NULL DEFAULT 'starting',
        checks_total INTEGER NOT NULL DEFAULT 0,
        checks_today INTEGER NOT NULL DEFAULT 0,
        checks_date TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        alert_sent INTEGER NOT NULL DEFAULT 0,
        alert_sent_at TEXT,
        alert_sending INTEGER NOT NULL DEFAULT 0,
        alert_last_attempt_at TEXT,
        milestone_confirmations INTEGER NOT NULL DEFAULT 0,
        settings_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS recipients (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_logs_at ON logs(at DESC);
    `);
  }

  #seed(defaults) {
    const settings = {
      targetUrl: defaults.targetUrl,
      counterLabel: defaults.counterLabel,
      counterSelector: defaults.counterSelector,
      checkIntervalMs: defaults.readIntervalMs,
      pageReloadSeconds: defaults.fullRefreshSeconds,
      alertTarget: 1000000000,
      emailSubject: DEFAULT_EMAIL_SUBJECT,
      emailBody: DEFAULT_EMAIL_BODY
    };

    this.db.prepare(`
      INSERT OR IGNORE INTO app_state (id, settings_json)
      VALUES (1, ?)
    `).run(JSON.stringify(settings));
  }

  loadState() {
    const row = this.db.prepare('SELECT * FROM app_state WHERE id = 1').get();
    const recipients = this.db.prepare('SELECT id, email, enabled, created_at FROM recipients ORDER BY created_at ASC').all();
    const logs = this.db.prepare('SELECT at, type, message FROM logs ORDER BY id DESC LIMIT 100').all();
    return {
      counter: Number(row.counter || 0),
      previousCounter: Number(row.previous_counter || 0),
      source: row.source,
      lastCheckedAt: row.last_checked_at,
      lastSuccessAt: row.last_success_at,
      lastChangedAt: row.last_changed_at,
      lastError: row.last_error,
      monitorStatus: row.monitor_status,
      checksTotal: Number(row.checks_total || 0),
      checksToday: Number(row.checks_today || 0),
      checksDate: row.checks_date,
      consecutiveFailures: Number(row.consecutive_failures || 0),
      alertSent: Boolean(row.alert_sent),
      alertSentAt: row.alert_sent_at,
      alertSending: Boolean(row.alert_sending),
      alertLastAttemptAt: row.alert_last_attempt_at,
      milestoneConfirmations: Number(row.milestone_confirmations || 0),
      settings: JSON.parse(row.settings_json),
      recipients: recipients.map((recipient) => ({
        id: recipient.id,
        email: recipient.email,
        enabled: Boolean(recipient.enabled),
        createdAt: recipient.created_at
      })),
      logs
    };
  }

  saveState(state) {
    this.db.prepare(`
      UPDATE app_state SET
        counter = ?,
        previous_counter = ?,
        source = ?,
        last_checked_at = ?,
        last_success_at = ?,
        last_changed_at = ?,
        last_error = ?,
        monitor_status = ?,
        checks_total = ?,
        checks_today = ?,
        checks_date = ?,
        consecutive_failures = ?,
        alert_sent = ?,
        alert_sent_at = ?,
        alert_sending = ?,
        alert_last_attempt_at = ?,
        milestone_confirmations = ?,
        settings_json = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      Number(state.counter || 0),
      Number(state.previousCounter || 0),
      String(state.source || ''),
      state.lastCheckedAt || null,
      state.lastSuccessAt || null,
      state.lastChangedAt || null,
      state.lastError || null,
      String(state.monitorStatus || 'starting'),
      Number(state.checksTotal || 0),
      Number(state.checksToday || 0),
      state.checksDate || null,
      Number(state.consecutiveFailures || 0),
      state.alertSent ? 1 : 0,
      state.alertSentAt || null,
      state.alertSending ? 1 : 0,
      state.alertLastAttemptAt || null,
      Number(state.milestoneConfirmations || 0),
      JSON.stringify(state.settings)
    );
  }

  replaceRecipients(recipients) {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.prepare('DELETE FROM recipients').run();
      const insert = this.db.prepare('INSERT INTO recipients (id, email, enabled, created_at) VALUES (?, ?, ?, ?)');
      for (const item of recipients) {
        insert.run(item.id, item.email, item.enabled ? 1 : 0, item.createdAt || new Date().toISOString());
      }
      this.db.exec('COMMIT;');
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
  }

  addLog(type, message, at = new Date().toISOString()) {
    this.db.prepare('INSERT INTO logs (at, type, message) VALUES (?, ?, ?)').run(at, type, message);
    this.db.prepare(`
      DELETE FROM logs
      WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 200)
    `).run();
    return { at, type, message };
  }

  close() {
    this.db.close();
  }
}

module.exports = { MonitorDatabase, DEFAULT_EMAIL_SUBJECT, DEFAULT_EMAIL_BODY };
