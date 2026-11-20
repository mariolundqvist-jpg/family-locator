import { checkCsrf, isBodyTooLarge } from './security.js';

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  badRequest: (msg, details) => new HttpError(400, 'bad_request', msg, details),
  unauthorized: (msg = 'Sign in to continue.') => new HttpError(401, 'unauthenticated', msg),
  forbidden: (msg = 'You do not have access to that.', code = 'forbidden') => new HttpError(403, code, msg),
  notFound: (msg = 'Not found.') => new HttpError(404, 'not_found', msg),
  conflict: (msg, code = 'conflict') => new HttpError(409, code, msg),
  gone: (msg, code = 'gone') => new HttpError(410, code, msg),
  tooMany: (retryAfterSec) => Object.assign(new HttpError(429, 'rate_limited', 'Too many attempts. Try again shortly.'), { retryAfterSec }),
  payload: (msg) => new HttpError(413, 'payload_too_large', msg),
};

export function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  res.end(payload);
}

export function sendNoContent(res, extraHeaders = {}) {
  res.writeHead(204, { 'cache-control': 'no-store', ...extraHeaders });
  res.end();
}

export function redirect(res, location, status = 302) {
  res.writeHead(status, { location, 'cache-control': 'no-store' });
  res.end();
}

const MAX_BODY = 16 * 1024;

export async function readJsonBody(req) {
  if (isBodyTooLarge(req, MAX_BODY)) throw errors.payload('Request body is too large.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw errors.payload('Request body is too large.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw errors.badRequest('Body must be a JSON object.');
  }
}

/**
 * Minimal router: exact paths plus `:param` segments. Routes declare whether
 * they are public or require a session, so authentication can never be
 * forgotten on a new endpoint — the default is "requires a session".
 */
export class Router {
  constructor() { this.routes = []; }

  add(method, pattern, handler, { auth = true } = {}) {
    const segments = pattern.split('/').filter(Boolean);
    this.routes.push({ method: method.toUpperCase(), segments, handler, auth });
    return this;
  }

  get(p, h, o) { return this.add('GET', p, h, o); }
  post(p, h, o) { return this.add('POST', p, h, o); }
  del(p, h, o) { return this.add('DELETE', p, h, o); }

  match(method, pathname) {
    const parts = pathname.split('/').filter(Boolean);
    let pathMatched = false;
    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < parts.length; i += 1) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) { ok = false; break; }
      }
      if (!ok) continue;
      pathMatched = true;
      if (route.method === method) return { route, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

/** Reject unexpected fields rather than silently ignoring them. */
export function assertFields(body, allowed, label = 'body') {
  const extra = Object.keys(body || {}).filter((k) => !allowed.includes(k));
  if (extra.length) {
    throw new HttpError(400, 'unexpected_field', `Unexpected field in ${label}: ${extra.join(', ')}`);
  }
  return body;
}

export function securityHeaders(res, csp) {
  res.setHeader('content-security-policy', csp);
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('cross-origin-opener-policy', 'same-origin');
  res.setHeader('permissions-policy', 'geolocation=(self), camera=(), microphone=(), interest-cohort=()');
  res.setHeader('x-content-type-options', 'nosniff');
}

export { checkCsrf };
