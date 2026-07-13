function numberCandidates(value, minimum = 100000, maximum = 10000000000) {
  const text = String(value || '');
  const pattern = /(?<!\d)(?:\d{1,3}(?:[,._\s\u00A0]\d{3})+|\d{6,16})(?!\d)/g;
  const candidates = [];
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const digits = match[0].replace(/[^0-9]/g, '');
    if (digits.length < 6 || digits.length > 16) continue;
    const number = Number(digits);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) continue;
    candidates.push({ number, index: match.index, raw: match[0] });
  }

  return candidates;
}

function parseCounter(value, { minimum = 100000, maximum = 10000000000 } = {}) {
  const candidates = numberCandidates(value, minimum, maximum);
  if (!candidates.length) return null;
  return Math.max(...candidates.map((candidate) => candidate.number));
}

function parseCounterNearLabel(value, label = 'Cards PhyzBatched', { minimum = 100000, maximum = 10000000000 } = {}) {
  const text = String(value || '');
  const candidates = numberCandidates(text, minimum, maximum);
  if (!candidates.length) return null;
  const labelIndex = text.toLowerCase().indexOf(String(label).toLowerCase());
  if (labelIndex < 0) return Math.max(...candidates.map((candidate) => candidate.number));

  const labelEnd = labelIndex + String(label).length;
  const after = candidates.filter((candidate) => candidate.index >= labelIndex);
  const pool = after.length ? after : candidates;
  pool.sort((a, b) => {
    const distanceA = a.index >= labelEnd ? a.index - labelEnd : labelIndex - a.index;
    const distanceB = b.index >= labelEnd ? b.index - labelEnd : labelIndex - b.index;
    if (distanceA !== distanceB) return distanceA - distanceB;
    return b.number - a.number;
  });
  return pool[0].number;
}

module.exports = { numberCandidates, parseCounter, parseCounterNearLabel };
