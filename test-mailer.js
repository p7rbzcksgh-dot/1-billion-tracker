const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { sendAnnouncement } = require('./mailer');

test('builds a one-billion email without external delivery', async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  const state = {
    counter: 1000000000,
    recipients: [{ email: 'team@tcgmachines.com', enabled: true }],
    settings: {
      emailSubject: 'TCG Machines has PhyzBatched 1 BILLION cards!',
      emailBody: 'We did it.'
    }
  };

  const result = await sendAnnouncement(state, { transport });
  const content = result.generatedMessage.toString('utf8');
  assert.equal(result.recipientCount, 1);
  assert.match(content, /1 BILLION cards/i);
  assert.match(content, /We did it/i);
  assert.match(content, /1,000,000,000/);
});

test('refuses to send with no enabled recipients', async () => {
  const state = {
    counter: 1000000000,
    recipients: [{ email: 'disabled@tcgmachines.com', enabled: false }],
    settings: { emailSubject: 'Subject', emailBody: 'Body' }
  };
  await assert.rejects(() => sendAnnouncement(state, {
    transport: nodemailer.createTransport({ streamTransport: true, buffer: true })
  }), /no enabled email recipients/i);
});
