const test = require('node:test');
const assert = require('node:assert/strict');
const { numberCandidates, parseCounter, parseCounterNearLabel } = require('./counter-parser');

test('parses comma-separated card totals', () => {
  assert.equal(parseCounter('Cards PhyzBatched 612,345,678'), 612345678);
});

test('parses totals split by spaces or punctuation', () => {
  assert.equal(parseCounter('612 345 678 cards'), 612345678);
  assert.equal(parseCounter('612.345.678 cards'), 612345678);
});

test('ignores years and implausibly large timestamps', () => {
  const values = numberCandidates('2026 612,345,678 1783968973745');
  assert.deepEqual(values.map((item) => item.number), [612345678]);
});

test('prefers the number closest to the counter label', () => {
  const text = 'Other total 200,000,000 | Cards PhyzBatched 612,345,678 | Target 1,000,000,000';
  assert.equal(parseCounterNearLabel(text, 'Cards PhyzBatched'), 612345678);
});


test('selects the live phyzbatched value instead of a one-billion target in network data', () => {
  const payload = '{"target":1000000000,"cardsPhyzbatched":847284521,"updatedAt":1783968973745}';
  assert.equal(parseCounterNearLabel(payload, 'phyz'), 847284521);
});

test('returns null when no usable total exists', () => {
  assert.equal(parseCounter('Cards PhyzBatched soon'), null);
});
