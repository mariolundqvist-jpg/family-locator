import crypto from 'node:crypto';
import { config } from './config.js';

const COOKIE_NAME = '__Host-safepath'.startsWith('__Host-') ? 'safepath_sid' : 'safepath_sid';

/** Constant-time string compare that tolerates differing lengths. */
export function safeEqual(a = '', b = '') {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) {
    // Still burn a comparison so the timing does not reveal length.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/** 256 bits of randomness, URL-safe. Used for session IDs and invite tokens. */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Six-digit sign-in code, uniformly distributed. */
export function randomDigits(digits = 6) {
  const max = 10 ** digits;
  // rejection sampling keeps the distribution uniform
  let n;
  do { n = crypto.randomBytes(4).readUInt32BE(0); } while (n >= Math.floor(0xffffffff / max) * max);
  return String(n % max).padStart(digits, '0');
}

/**
 * Tokens are stored only as keyed hashes. A dump of the database therefore
 * cannot be used to accept an invitation or hijack a session.
 */
export function hashToken(token, scope = 'token') {
  return crypto.createHmac('sha256', config.secret).update(`${scope}:${token}`).digest('base64url');
}

export function normaliseEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  // Deliberately permissive but bounded: one @, no whitespace, no control chars.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  if (/[\u0000-\u001f\u007f]/.test(email)) return null;
  return email;
}

/** Extremely light-weight email-quality signals used only to order the UI. */
export function emailDomain(email) {
  return email.slice(email.indexOf('@') + 1);
}

export function parseCookies(header = '') {
  const out = Object.create(null);
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function isSecureRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto === 'https') return true;
  return Boolean(req.socket && req.socket.encrypted);
}

export function sessionCookie(token, { secure, maxAgeMs }) {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearSessionCookie({ secure }) {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function readSessionToken(req) {
  // Native clients send a bearer token; browsers use the HttpOnly cookie.
  // Both resolve to the same session record, so authorisation logic is shared.
  const auth = String(req.headers.authorization || '');
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[COOKIE_NAME] || null;
}

/**
 * CSRF defence in depth:
 *   1. SameSite=Lax cookies (so cross-site POSTs never carry the session)
 *   2. a required custom header on every state-changing request, which a
 *      cross-origin form or <img> cannot set
 *   3. Origin check when the browser supplies one
 */
export function checkCsrf(req, origin) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  const custom = req.headers['x-safepath-client'];
  if (custom !== 'web' && custom !== 'mobile') {
    return { status: 403, code: 'csrf_header_missing', message: 'Missing X-SafePath-Client header.' };
  }

  // Compare *hosts*, not full origins. Behind a TLS-terminating proxy the
  // scheme we infer locally can differ from the browser's, and a scheme
  // mismatch is not what CSRF protection is about — the host is. A browser
  // cannot forge Origin, so a matching host means a same-site request.
  const source = req.headers.origin || req.headers.referer;
  if (source) {
    let sourceHost = null;
    try { sourceHost = new URL(source).host.toLowerCase(); } catch { sourceHost = null; }
    const targetHost = String(origin || '').replace(/^[a-z]+:\/\//i, '').toLowerCase();
    if (sourceHost && targetHost && sourceHost !== targetHost) {
      return { status: 403, code: 'cross_origin', message: 'Request origin is not permitted.' };
    }
  }
  return null;
}

/** In-memory fixed-window rate limiter, keyed by IP + bucket. */
export class RateLimiter {
  constructor() { this.buckets = new Map(); }

  hit(key, { limit, windowMs }, now = Date.now()) {
    let b = this.buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, b);
    }
    b.count += 1;
    const allowed = b.count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - b.count),
      retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
    };
  }

  sweep(now = Date.now()) {
    for (const [k, b] of this.buckets) if (now >= b.resetAt) this.buckets.delete(k);
  }
}

/** Reject absurd JSON before it is parsed. */
export function isBodyTooLarge(req, maxBytes = 16 * 1024) {
  const len = Number(req.headers['content-length'] || 0);
  return Number.isFinite(len) && len > maxBytes;
}
