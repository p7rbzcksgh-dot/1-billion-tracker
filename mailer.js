const nodemailer = require('nodemailer');

function streamModeEnabled() {
  return String(process.env.MAIL_STREAM_MODE || 'false').toLowerCase() === 'true';
}

function smtpConfigured() {
  return streamModeEnabled() || Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  if (streamModeEnabled()) {
    return nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  }

  if (!smtpConfigured()) {
    throw new Error('Email is not configured. Add SMTP_HOST, SMTP_USER and SMTP_PASS to the .env file.');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    pool: true,
    maxConnections: 2,
    maxMessages: 100,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000
  });
}

function enabledRecipients(state) {
  return state.recipients
    .filter((recipient) => recipient.enabled && recipient.email)
    .map((recipient) => recipient.email);
}

function buildHtml(state, test) {
  const currentTotal = Number(state.counter || 0).toLocaleString('en-CA');
  const body = String(state.settings.emailBody || '').split('\n').map((line) =>
    line ? `<p style="margin:0 0 12px">${escapeHtml(line)}</p>` : '<div style="height:8px"></div>'
  ).join('');

  return `
    <div style="background:#0a0c0d;padding:28px;font-family:Arial,sans-serif;color:#f7f7f5">
      <div style="max-width:620px;margin:0 auto;border:1px solid #303438;border-radius:18px;overflow:hidden;background:#111416">
        <div style="padding:22px 26px;border-bottom:4px solid #f47a20">
          <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#f47a20;font-weight:700">TCG Machines</div>
          <h1 style="font-size:30px;margin:8px 0 0;color:#fff">${test ? 'Test alert' : '1 Billion Cards'}</h1>
        </div>
        <div style="padding:26px">
          ${body}
          <div style="margin:24px 0;padding:18px;border-radius:14px;background:#1a1e21;text-align:center">
            <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#a8ada8">Verified Cards PhyzBatched</div>
            <div style="font-size:34px;font-weight:800;color:#fff;margin-top:6px">${currentTotal}</div>
          </div>
          <p style="margin:0;color:#a8ada8;font-size:13px">Verified at ${new Date().toLocaleString('en-CA')}.</p>
          ${test ? '<p style="margin:10px 0 0;color:#f0c54c;font-size:13px">This is a test message. The one-billion alert lock was not changed.</p>' : ''}
        </div>
      </div>
    </div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function sendAnnouncement(state, { test = false, transport = null } = {}) {
  const recipients = enabledRecipients(state);
  if (!recipients.length) throw new Error('There are no enabled email recipients.');

  const mailer = transport || createTransport();
  const subject = `${test ? '[TEST] ' : ''}${state.settings.emailSubject}`;
  const currentTotal = Number(state.counter || 0).toLocaleString('en-CA');
  const text = [
    state.settings.emailBody,
    '',
    `Verified Cards PhyzBatched: ${currentTotal}`,
    `Verified at: ${new Date().toLocaleString('en-CA')}`,
    '',
    test ? 'This is a test message from the TCG 1 Billion Monitor.' : 'This milestone alert is protected against duplicate sends.'
  ].join('\n');

  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'TCG Machines Monitor <monitor@localhost>';
  const to = process.env.SMTP_USER || from;
  const info = await mailer.sendMail({
    from,
    to,
    bcc: recipients,
    subject,
    text,
    html: buildHtml(state, test)
  });

  return {
    messageId: info.messageId || null,
    recipientCount: recipients.length,
    generatedMessage: info.message || null
  };
}

module.exports = { smtpConfigured, createTransport, enabledRecipients, sendAnnouncement };
