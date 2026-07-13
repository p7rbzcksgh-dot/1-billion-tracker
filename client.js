(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  let state = null;
  let socket = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  let settingsInitialized = false;
  let settingsDirty = false;
  let celebrationShown = false;
  let toastTimer = null;

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });

    let payload = {};
    try { payload = await response.json(); } catch (_) { /* no JSON body */ }
    if (!response.ok) {
      if (response.status === 401 && !url.endsWith('/login')) showLogin();
      throw new Error(payload.error || `Request failed (${response.status})`);
    }
    return payload;
  }

  function showLogin() {
    socket?.close();
    $('#app').classList.add('hidden');
    $('#loginScreen').classList.remove('hidden');
    $('#passwordInput').focus();
  }

  function showApp() {
    $('#loginScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-CA');
  }

  function timeAgo(iso) {
    if (!iso) return 'Waiting';
    const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
    if (seconds < 3) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return new Date(iso).toLocaleString('en-CA');
  }

  function statusLabel(status) {
    return ({
      connected: 'Connected',
      connecting: 'Connecting',
      reconnecting: 'Reconnecting',
      starting: 'Starting',
      disabled: 'Disabled'
    })[status] || 'Starting';
  }

  function frequencyLabel(milliseconds) {
    const value = Number(milliseconds || 250);
    if (value < 1000) return `Every ${value} ms`;
    const seconds = value / 1000;
    return `Every ${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} second${seconds === 1 ? '' : 's'}`;
  }

  function showToast(message, error = false) {
    const toast = $('#toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast${error ? ' error' : ''}`;
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 4200);
  }

  function setBusy(button, busy, label) {
    if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? label : button.dataset.originalLabel;
  }

  function render() {
    if (!state) return;
    const target = Number(state.settings.alertTarget || 1000000000);
    const counter = Number(state.counter || 0);
    const percent = Math.min(100, Math.max(0, (counter / target) * 100));
    const remaining = Math.max(0, target - counter);

    $('#counter').textContent = formatNumber(counter);
    $('#progressFill').style.width = `${percent}%`;
    $('#progressPercent').textContent = `${percent.toFixed(4)}%`;
    $('#remaining').textContent = formatNumber(remaining);
    $('#lastReading').textContent = timeAgo(state.lastSuccessAt);
    $('#lastChanged').textContent = timeAgo(state.lastChangedAt);
    $('#frequency').textContent = frequencyLabel(state.settings.checkIntervalMs);
    $('#monitorStatus').textContent = statusLabel(state.monitorStatus);
    $('#statusDot').className = `status-dot ${state.monitorStatus || ''}`;
    $('#alertStatus').textContent = state.alertSending ? 'Sending…' : state.alertSent ? 'Sent' : 'Armed';
    $('#recipientCount').textContent = `${state.enabledRecipientCount} ready`;
    $('#checksToday').textContent = formatNumber(state.checksToday);
    $('#source').textContent = state.source || 'Waiting for first reading';
    $('#smtpStatus').textContent = state.smtpConfigured ? 'Configured' : 'Not configured';
    $('#smtpStatus').style.color = state.smtpConfigured ? 'var(--green)' : 'var(--yellow)';
    $('#lastError').textContent = state.lastError || '';

    if (!settingsInitialized || (!settingsDirty && !document.activeElement?.closest('.settings-panel'))) {
      $('#targetUrl').value = state.settings.targetUrl || '';
      $('#counterLabelInput').value = state.settings.counterLabel || '';
      $('#counterSelector').value = state.settings.counterSelector || '';
      $('#checkIntervalMs').value = String(state.settings.checkIntervalMs || 250);
      $('#pageReloadSeconds').value = String(state.settings.pageReloadSeconds || 30);
      $('#emailSubject').value = state.settings.emailSubject || '';
      $('#emailBody').value = state.settings.emailBody || '';
      settingsInitialized = true;
      settingsDirty = false;
    }

    renderRecipients();

    if (state.alertSent && !celebrationShown) {
      celebrationShown = true;
      showCelebration();
    }
  }

  function renderRecipients() {
    const list = $('#recipientList');
    list.replaceChildren();

    if (!state.recipients.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No recipients yet. Add the first email address above.';
      list.append(empty);
      return;
    }

    for (const recipient of state.recipients) {
      const row = document.createElement('div');
      row.className = 'recipient';

      const email = document.createElement('div');
      email.className = 'recipient-email';
      email.textContent = recipient.email;
      email.title = recipient.email;

      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'toggle-label';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = recipient.enabled;
      toggle.setAttribute('aria-label', `Enable alerts for ${recipient.email}`);
      toggle.addEventListener('change', async () => {
        toggle.disabled = true;
        try {
          state = await api(`/api/recipients/${encodeURIComponent(recipient.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled: toggle.checked })
          });
          render();
        } catch (error) {
          toggle.checked = !toggle.checked;
          showToast(error.message, true);
        } finally {
          toggle.disabled = false;
        }
      });
      toggleLabel.append(toggle, document.createTextNode('Enabled'));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${recipient.email}`);
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Remove ${recipient.email} from the alert list?`)) return;
        remove.disabled = true;
        try {
          state = await api(`/api/recipients/${encodeURIComponent(recipient.id)}`, { method: 'DELETE' });
          render();
          showToast('Email removed.');
        } catch (error) {
          showToast(error.message, true);
          remove.disabled = false;
        }
      });

      row.append(email, toggleLabel, remove);
      list.append(row);
    }
  }

  function connectSocket() {
    clearTimeout(reconnectTimer);
    socket?.close();
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/ws`);

    socket.addEventListener('open', () => {
      reconnectDelay = 1000;
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'state') {
          state = message.payload;
          render();
        } else if (message.type === 'celebration') {
          showCelebration();
        }
      } catch (_) {
        // Ignore malformed messages.
      }
    });

    socket.addEventListener('close', () => {
      if ($('#app').classList.contains('hidden')) return;
      $('#monitorStatus').textContent = 'Dashboard reconnecting';
      $('#statusDot').className = 'status-dot reconnecting';
      reconnectTimer = setTimeout(connectSocket, reconnectDelay);
      reconnectDelay = Math.min(15000, reconnectDelay * 1.7);
    });
  }

  function showCelebration() {
    $('#celebration').classList.remove('hidden');
    $('#celebrationDelivery').textContent = state?.alertSent
      ? 'Notification emails have been sent.'
      : 'The milestone has been reached.';

    for (let index = 0; index < 90; index += 1) {
      const piece = document.createElement('div');
      piece.className = 'confetti';
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = index % 3 === 0 ? '#f47a20' : index % 3 === 1 ? '#7cdd72' : '#f8f8f5';
      piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 260}px`);
      piece.style.animationDuration = `${2.7 + Math.random() * 2.3}s`;
      piece.style.animationDelay = `${Math.random() * 0.8}s`;
      document.body.append(piece);
      setTimeout(() => piece.remove(), 6000);
    }
  }

  async function initialize() {
    const session = await api('/api/session');
    if (!session.authenticated) {
      showLogin();
      return;
    }
    showApp();
    state = await api('/api/state');
    render();
    connectSocket();
  }

  $('#loginButton').addEventListener('click', async () => {
    const button = $('#loginButton');
    $('#loginError').textContent = '';
    setBusy(button, true, 'Entering…');
    try {
      await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ password: $('#passwordInput').value })
      });
      $('#passwordInput').value = '';
      showApp();
      state = await api('/api/state');
      render();
      connectSocket();
    } catch (error) {
      $('#loginError').textContent = error.message;
    } finally {
      setBusy(button, false);
    }
  });

  $('#passwordInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $('#loginButton').click();
  });

  $('#logoutButton').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } finally { location.reload(); }
  });

  $('#addEmail').addEventListener('click', async () => {
    const input = $('#newEmail');
    const email = input.value.trim().toLowerCase();
    const button = $('#addEmail');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Enter a valid email address.', true);
      input.focus();
      return;
    }

    setBusy(button, true, 'Adding…');
    try {
      state = await api('/api/recipients', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      input.value = '';
      render();
      showToast('Email added to the alert list.');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setBusy(button, false);
    }
  });

  $('#newEmail').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $('#addEmail').click();
  });

  $('#testEmail').addEventListener('click', async () => {
    const button = $('#testEmail');
    setBusy(button, true, 'Sending…');
    try {
      const result = await api('/api/test-email', { method: 'POST' });
      showToast(`Test email sent to ${result.recipientCount} recipient${result.recipientCount === 1 ? '' : 's'}.`);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setBusy(button, false);
    }
  });

  $('#checkNow').addEventListener('click', async () => {
    const button = $('#checkNow');
    setBusy(button, true, 'Checking…');
    try {
      await api('/api/check', { method: 'POST' });
      showToast('Live page refresh started.');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setTimeout(() => setBusy(button, false), 800);
    }
  });

  document.querySelectorAll('.settings-panel input, .settings-panel textarea, .settings-panel select').forEach((control) => {
    control.addEventListener('input', () => { settingsDirty = true; });
    control.addEventListener('change', () => { settingsDirty = true; });
  });

  $('#saveSettings').addEventListener('click', async () => {
    const button = $('#saveSettings');
    setBusy(button, true, 'Saving…');
    try {
      state = await api('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          targetUrl: $('#targetUrl').value,
          counterLabel: $('#counterLabelInput').value,
          counterSelector: $('#counterSelector').value,
          checkIntervalMs: Number($('#checkIntervalMs').value),
          pageReloadSeconds: Number($('#pageReloadSeconds').value),
          emailSubject: $('#emailSubject').value,
          emailBody: $('#emailBody').value
        })
      });
      settingsDirty = false;
      render();
      showToast('Monitor settings saved.');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setBusy(button, false);
    }
  });

  $('#resetAlert').addEventListener('click', async () => {
    if (!window.confirm('Reset the one-billion sent-alert lock? This allows the milestone email to send again.')) return;
    const button = $('#resetAlert');
    setBusy(button, true, 'Resetting…');
    try {
      state = await api('/api/reset-alert', { method: 'POST' });
      celebrationShown = false;
      render();
      showToast('Sent-alert lock reset.');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setBusy(button, false);
    }
  });

  $('#closeCelebration').addEventListener('click', () => {
    $('#celebration').classList.add('hidden');
  });

  setInterval(() => {
    if (!state) return;
    $('#lastReading').textContent = timeAgo(state.lastSuccessAt);
    $('#lastChanged').textContent = timeAgo(state.lastChangedAt);
  }, 1000);

  initialize().catch((error) => {
    $('#loginError').textContent = error.message;
    showLogin();
  });
})();
