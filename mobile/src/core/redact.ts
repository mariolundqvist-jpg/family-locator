/**
 * Log redaction.
 *
 * Coordinates and authentication secrets must never reach a log file, a crash
 * reporter or the OS console. This module is a deliberately blunt filter: it
 * would rather hide a harmless field than leak a position.
 *
 * The server applies an equivalent filter (server/lib/store-pg.js), so a fix
 * that leaks in the app is also scrubbed before it is written to the audit
 * table. Both are tested.
 */

const SENSITIVE_WORDS = new Set([
  'lat',
  'lng',
  'lon',
  'latitude',
  'longitude',
  'coord',
  'coords',
  'coordinate',
  'coordinates',
  'accuracy',
  'accuracym',
  'token',
  'tokenhash',
  'secret',
  'password',
  'passcode',
  'code',
  'devcode',
  'otp',
  'pin',
  'authorization',
  'cookie',
  'session',
  'sessiontoken',
  'sess',
  'hash',
]);

const REDACTED = '[redacted]';

/** Splits `accuracyM` -> ['accuracy','m'] and `user-token` -> ['user','token']. */
export function splitKeyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

export function isSensitiveKey(key: string): boolean {
  return splitKeyWords(key).some((word) => SENSITIVE_WORDS.has(word));
}

/** A pair of decimal numbers that could be a coordinate. */
const COORDINATE_PAIR = /-?\d{1,3}\.\d{3,}\s*[,;]\s*-?\d{1,3}\.\d{3,}/;
/** Bare high-precision decimals (a coordinate on its own). */
const BARE_COORDINATE = /-?\d{2,3}\.\d{5,}/;
/** Session tokens and API keys are long and unstructured. */
const LONG_SECRET = /\b[A-Za-z0-9_-]{32,}\b/;

export function looksLikeCoordinate(text: string): boolean {
  return COORDINATE_PAIR.test(text) || BARE_COORDINATE.test(text);
}

export function containsSecret(text: string): boolean {
  return LONG_SECRET.test(text);
}

export type RedactOptions = {
  /** Also scrub anything that looks like a coordinate or a token in strings. */
  scrubStrings?: boolean;
  /** Query strings in URLs sometimes carry codes; drop them by default. */
  stripQuery?: boolean;
};

export function redact(value: unknown, options: RedactOptions = {}, depth = 0): unknown {
  const { scrubStrings = true, stripQuery = true } = options;

  if (value === null || value === undefined) return value;
  if (depth > 6) return '[depth-limit]';

  if (typeof value === 'string') {
    let out = value;
    if (stripQuery) out = out.replace(/(\?[^#\s]*)/g, '?[query-removed]');
    if (scrubStrings) {
      out = out
        .replace(new RegExp(COORDINATE_PAIR.source, 'g'), '[coordinate]')
        .replace(new RegExp(BARE_COORDINATE.source, 'g'), '[coordinate]')
        .replace(new RegExp(LONG_SECRET.source, 'g'), '[secret]');
    }
    return out;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return '[bigint]';
  if (value instanceof Error) {
    return {
      name: value.name,
      // A stack can embed request URLs; keep it short and query-free.
      message: redact(value.message, options, depth + 1),
      status: (value as { status?: number }).status,
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => redact(v, options, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redact(v, options, depth + 1);
    }
    return out;
  }
  return '[unloggable]';
}

export function safeStringify(value: unknown, options: RedactOptions = {}): string {
  try {
    return JSON.stringify(redact(value, options));
  } catch {
    return '[unserialisable]';
  }
}

/**
 * Wrap the console so that anything logged anywhere in the app passes through
 * the filter. Installed once at startup; returns a function that restores the
 * originals, which is what the tests use.
 */
export function installConsoleRedaction(target: Pick<Console, 'log' | 'warn' | 'error'> = console): () => void {
  const original = {
    log: target.log.bind(target),
    warn: target.warn.bind(target),
    error: target.error.bind(target),
  };

  const wrap =
    (fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) =>
      fn(...args.map((a) => (typeof a === 'string' ? redact(a) : redact(a))));

  target.log = wrap(original.log) as typeof target.log;
  target.warn = wrap(original.warn) as typeof target.warn;
  target.error = wrap(original.error) as typeof target.error;

  return () => {
    target.log = original.log;
    target.warn = original.warn;
    target.error = original.error;
  };
}

/** Rate-limited logger used across the app. Never accepts a raw fix. */
export function createLogger(scope: string, sink: Pick<Console, 'log'> = console) {
  return {
    info(event: string, data?: Record<string, unknown>) {
      sink.log(`[${scope}] ${event}${data ? ' ' + safeStringify(data) : ''}`);
    },
    warn(event: string, data?: Record<string, unknown>) {
      sink.log(`[${scope}] WARN ${event}${data ? ' ' + safeStringify(data) : ''}`);
    },
  };
}
