/**
 * Logging with a hard rule: coordinates and credentials never reach a log sink.
 *
 * Two layers:
 *   1. callers pass structured fields and we drop anything sensitive by key;
 *   2. every rendered line is passed through redact() so a sensitive value that
 *      slipped in inside a message is caught before it is written.
 *
 * A test in tests/security-suite.mjs captures the server's entire stdout/stderr
 * during a full flow (including a real request carrying lat/lng) and fails if a
 * coordinate, session token, invitation token or sign-in code appears.
 */

const SENSITIVE_KEY = /(pass(word)?|secret|token|code|authorization|cookie|session|api[_-]?key|credential|email|ip|lat|lng|latitude|longitude|coord|accuracy)/i;
const COORDINATE = /-?\b\d{1,3}\.\d{4,}\b/g;
const LONG_SECRET = /\b[A-Za-z0-9_-]{32,}\b/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;

export function redact(text) {
  return String(text)
    .replace(BEARER, 'Bearer [redacted]')
    .replace(LONG_SECRET, '[redacted]')
    .replace(COORDINATE, '[coord]');
}

function clean(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = '[redacted]';
    } else if (v !== null && typeof v === 'object') {
      out[k] = '[object]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function emit(level, message, fields) {
  const parts = [message];
  const cleaned = clean(fields);
  for (const [k, v] of Object.entries(cleaned)) parts.push(`${k}=${v}`);
  const line = redact(parts.join(' '));
  const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  stream(line);
}

export const log = {
  info: (message, fields) => emit('info', message, fields),
  warn: (message, fields) => emit('warn', message, fields),
  error: (message, fields) => emit('error', message, fields),
};

/** Route the legacy console.* calls used elsewhere through the same redactor. */
export function installGlobalRedaction() {
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ['log', 'warn', 'error']) {
    console[level] = (...args) => {
      const line = args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ');
      original[level](redact(line));
    };
  }
  return () => { Object.assign(console, original); };
}

function safeStringify(value) {
  try { return JSON.stringify(value); } catch { return '[unserialisable]'; }
}

export { clean as _cleanFields };
