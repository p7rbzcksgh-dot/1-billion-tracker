class MonitorStore {
  constructor(database) {
    this.database = database;
    this.state = database.loadState();
    this.saveTimer = null;
  }

  get() {
    return this.state;
  }

  mutate(updater, { immediate = false } = {}) {
    updater(this.state);
    if (immediate) this.saveNow();
    else this.saveSoon();
    return this.state;
  }

  setRecipients(recipients) {
    this.state.recipients = recipients;
    this.database.replaceRecipients(recipients);
  }

  log(type, message) {
    const entry = this.database.addLog(String(type || 'info'), String(message || ''));
    this.state.logs.unshift(entry);
    this.state.logs = this.state.logs.slice(0, 100);
    return entry;
  }

  saveSoon(delayMs = 5000) {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.saveNow(), delayMs);
    this.saveTimer.unref?.();
  }

  saveNow() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.database.saveState(this.state);
  }

  close() {
    this.saveNow();
    this.database.close();
  }
}

module.exports = { MonitorStore };
