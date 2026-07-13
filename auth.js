const crypto = require('crypto');

const COOKIE_NAME = 'tcg_monitor_auth';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function secureEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('base64url');
}

function createToken(secret, now = Date.now()) {
  const timestamp = Math.floor(now / 1000).toString();
  return `${timestamp}.${sign(timestamp, secret)}`;
}

function verifyToken(token, secret, now = Date.now()) {
  const [timestamp, signature, extra] = String(token || '').split('.');
  if (!timestamp || !signature || extra) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  if (!secureEqual(signature, sign(timestamp, secret))) return false;
  const issuedAt = Number(timestamp);
  const age = Math.floor(now / 1000) - issuedAt;
  return age >= 0 && age <= MAX_AGE_SECONDS;
}

function parseCookies(header = '') {
  const cookies = {};
  for (const segment of String(header).split(';')) {
    const index = segment.indexOf('=');
    if (index < 0) continue;
    const key = segment.slice(0, index).trim();
    const value = segment.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch (_) {
      cookies[key] = value;
    }
  }
  return cookies;
}

function isAuthenticatedRequest(req, secret) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  return verifyToken(token, secret);
}

function setAuthCookie(res, token, secure) {
  const pieces = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (secure) pieces.push('Secure');
  res.setHeader('Set-Cookie', pieces.join('; '));
}

function clearAuthCookie(res, secure) {
  const pieces = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (secure) pieces.push('Secure');
  res.setHeader('Set-Cookie', pieces.join('; '));
}

function createAuthMiddleware(secret) {
  return function auth(req, res, next) {
    if (isAuthenticatedRequest(req, secret)) return next();
    return res.status(401).json({ error: 'Please enter the monitor password.' });
  };
}

module.exports = {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  secureEqual,
  createToken,
  verifyToken,
  parseCookies,
  isAuthenticatedRequest,
  setAuthCookie,
  clearAuthCookie,
  createAuthMiddleware
};
