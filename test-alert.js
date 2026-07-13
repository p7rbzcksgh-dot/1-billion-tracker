const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldAttemptMilestone } = require('./alert');

function readyState(overrides = {}) {
  return {
    counter: 1000000000,
    alertSent: false,
    alertSending: false,
    alertLastAttemptAt: null,
    milestoneConfirmations: 2,
    settings: { alertTarget: 1000000000 },
    ...overrides
  };
}

test('milestone requires target, two confirmations and no active lock', () => {
  assert.equal(shouldAttemptMilestone(readyState()), true);
  assert.equal(shouldAttemptMilestone(readyState({ counter: 999999999 })), false);
  assert.equal(shouldAttemptMilestone(readyState({ milestoneConfirmations: 1 })), false);
  assert.equal(shouldAttemptMilestone(readyState({ alertSent: true })), false);
  assert.equal(shouldAttemptMilestone(readyState({ alertSending: true })), false);
});

test('milestone retry observes the one-minute cooldown', () => {
  const now = Date.now();
  assert.equal(shouldAttemptMilestone(readyState({ alertLastAttemptAt: new Date(now - 30000).toISOString() }), now), false);
  assert.equal(shouldAttemptMilestone(readyState({ alertLastAttemptAt: new Date(now - 61000).toISOString() }), now), true);
});
