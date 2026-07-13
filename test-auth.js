const test = require('node:test');
const assert = require('node:assert/strict');
const {
  secureEqual,
  createToken,
  verifyToken,
  parseCookies,
  MAX_AGE_SECONDS
} = require('./auth');

test('secureEqual compares values without accepting different lengths', () => {
  assert.equal(secureEqual('#1Billion', '#1Billion'), true);
  assert.equal(secureEqual('#1Billion', '#1Billion!'), false);
});

test('signed auth tokens validate and expire', () => {
  const secret = 'a-long-test-secret';
  const now = Date.now();
  const token = createToken(secret, now);
  assert.equal(verifyToken(token, secret, now + 1000), true);
  assert.equal(verifyToken(token, 'wrong-secret', now + 1000), false);
  assert.equal(verifyToken(token, secret, now + (MAX_AGE_SECONDS + 1) * 1000), false);
});

test('cookie parser handles multiple cookies', () => {
  assert.deepEqual(parseCookies('one=1; tcg_monitor_auth=abc.def; encoded=hello%20world'), {
    one: '1',
    tcg_monitor_auth: 'abc.def',
    encoded: 'hello world'
  });
});
