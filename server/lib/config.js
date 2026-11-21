// Runtime configuration. Every value can be overridden by an environment variable
// so that the security test suite can drive the *same* code paths with short TTLs
// rather than adding test-only branches to production logic.
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid integer for ${name}: ${raw}`);
  return n;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

/**
 * The signing secret must exist before the server will start. In development we
 * generate one and persist it to the data directory so that restarting the
 * server does not silently invalidate every session (and so that the value is
 * never a hard-coded constant). In production the absence of a secret is fatal.
 */
function resolveSecret(dataDir) {
  if (process.env.SAFEPATH_SECRET) {
    if (process.env.SAFEPATH_SECRET.length < 32) {
      throw new Error('SAFEPATH_SECRET must be at least 32 characters');
    }
    return process.env.SAFEPATH_SECRET;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SAFEPATH_SECRET is required when NODE_ENV=production');
  }
  const file = path.join(dataDir, '.dev-secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('base64url');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

/**
 * Production invariants. These throw at import time so a misconfigured
 * production process cannot start, serve one request, and quietly email codes to
 * a terminal or accept demo authentication.
 */
function assertProductionInvariants(cfg) {
  if (!cfg.production) return;
  const problems = [];

  if (cfg.devDelivery) {
    problems.push(
      'DEV_DELIVERY=1 in production. Demo authentication returns the sign-in code '
      + 'in the HTTP response, which would let anyone sign in as anyone. Refusing to start.',
    );
  }
  if (!cfg.secret || process.env.SAFEPATH_SECRET === undefined) {
    problems.push('SAFEPATH_SECRET is required in production (>=32 chars).');
  }
  if (!cfg.databaseUrl) {
    problems.push('DATABASE_URL is required in production; the JSON store is single-process only.');
  }
  if (!cfg.email.provider || cfg.email.provider === 'console') {
    problems.push('EMAIL_PROVIDER must be resend or postmark in production.');
  } else if (!['resend', 'postmark'].includes(cfg.email.provider)) {
    problems.push(`EMAIL_PROVIDER "${cfg.email.provider}" is not supported (resend|postmark).`);
  }
  if (!cfg.email.apiKey) problems.push('EMAIL_API_KEY is required in production.');
  if (!cfg.email.from) problems.push('EMAIL_FROM is required in production.');

  if (problems.length) {
    throw new Error(
      'Refusing to start in production.\n  - ' + problems.join('\n  - ')
      + '\nSee docs/CREDENTIALS-NEEDED.md.',
    );
  }
}

export const config = (() => {
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(ROOT, 'server', 'data');

  const cfg = {
    root: ROOT,
    dataDir,
    publicDir: path.join(ROOT, 'server', 'public'),
    port: int('PORT', 8787),
    host: process.env.HOST || '0.0.0.0',
    secret: process.env.SAFEPATH_SECRET || resolveSecret(dataDir),

    // Identity
    sessionTtlMs: int('SESSION_TTL_MS', 12 * 60 * 60 * 1000),
    sessionIdleMs: int('SESSION_IDLE_MS', 2 * 60 * 60 * 1000),
    codeTtlMs: int('CODE_TTL_MS', 10 * 60 * 1000),
    codeMaxAttempts: int('CODE_MAX_ATTEMPTS', 5),

    // Invitations
    inviteTtlMs: int('INVITE_TTL_MS', 30 * 60 * 1000),

    // Location freshness thresholds (server is authoritative; the client cannot
    // influence the reported state, only the captured_at it claims).
    currentMaxMs: int('CURRENT_MAX_MS', 120 * 1000),
    staleMaxMs: int('STALE_MAX_MS', 15 * 60 * 1000),
    // Data minimisation: last-known location is hard-deleted after this window.
    locationRetentionMs: int('LOCATION_RETENTION_MS', 15 * 60 * 1000),
    // How far in the future a device clock may claim a fix before we reject it.
    clockSkewMs: int('CLOCK_SKEW_MS', 120 * 1000),
    maxAccuracyM: int('MAX_ACCURACY_M', 20000),

    sweepIntervalMs: int('SWEEP_INTERVAL_MS', 30 * 1000),

    // Group limits
    maxMembersPerFamily: int('MAX_MEMBERS', 8),
    maxFamiliesPerUser: int('MAX_FAMILIES_PER_USER', 5),
    maxFamiliesTotal: int('MAX_FAMILIES_TOTAL', 500),

    // Rate limits (per IP, per window)
    rateLimit: {
      requestCode: { limit: int('RL_REQUEST_CODE', 5), windowMs: 15 * 60 * 1000 },
      verifyCode: { limit: int('RL_VERIFY', 10), windowMs: 15 * 60 * 1000 },
      invitePeek: { limit: int('RL_INVITE_PEEK', 20), windowMs: 10 * 60 * 1000 },
      inviteAccept: { limit: int('RL_INVITE_ACCEPT', 10), windowMs: 10 * 60 * 1000 },
      locationPost: { limit: 120, windowMs: 60 * 1000 },
      write: { limit: 60, windowMs: 60 * 1000 },
      read: { limit: 240, windowMs: 60 * 1000 },
    },

    // Persistence
    databaseUrl: process.env.DATABASE_URL || null,
    databaseSsl: bool('DATABASE_SSL', false),

    // Delivery
    devDelivery: bool('DEV_DELIVERY', process.env.NODE_ENV !== 'production'),
    production: process.env.NODE_ENV === 'production',
    email: {
      provider: (process.env.EMAIL_PROVIDER || '').toLowerCase() || null,
      apiKey: process.env.EMAIL_API_KEY || null,
      from: process.env.EMAIL_FROM || null,
    },

    // Content Security Policy for the served client.
    csp: [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "form-action 'none'",
      process.env.NODE_ENV === 'production'
        ? "frame-ancestors 'self'"
        : "frame-ancestors 'self' https://*.e2b.app https://*.arena.ai https://arena.ai",
      "base-uri 'none'",
      "object-src 'none'",
    ].join('; '),
  };

  assertProductionInvariants(cfg);
  return cfg;
})();
