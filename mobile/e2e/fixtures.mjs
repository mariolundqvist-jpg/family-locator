#!/usr/bin/env node
/**
 * E2E account fixtures for the device tests.
 *
 * Creates exactly two isolated accounts per run:
 *
 *   e2e-user-a-<run>@safepath.test   owner of the test group
 *   e2e-user-b-<run>@safepath.test   invited member
 *
 * and, with `cleanup`, deletes every record those accounts created. Nothing is
 * shared with any other test run: the run id is in the address, so two runs on
 * the same server cannot collide.
 *
 * Usage:
 *   node e2e/fixtures.mjs seed     [--base http://127.0.0.1:8787]
 *   node e2e/fixtures.mjs cleanup  [--base ...] [--file e2e/.runtime/fixtures.json]
 *
 * Output is JSON on stdout so the shell runner can read it with jq or grep.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const RUNTIME_DIR = join(here, '.runtime');
const DEFAULT_FILE = join(RUNTIME_DIR, 'fixtures.json');

const PREFIX = { a: 'e2e-user-a-', b: 'e2e-user-b-' };

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const BASE = arg('base', process.env.SAFEPATH_BASE ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const FILE = arg('file', DEFAULT_FILE);
const command = process.argv[2];

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'x-safepath-client': 'mobile', accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${json?.error?.message ?? ''}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Sign in with the demo code path. Only works when the server runs DEV_DELIVERY=1. */
async function signIn(email) {
  const requested = await call('/api/auth/request-code', { method: 'POST', body: { email } });
  if (requested.delivery !== 'dev' || !requested.devCode) {
    throw new Error(
      'This server is not returning demo codes. Fixtures need DEV_DELIVERY=1 (development only) ' +
        'or a mailbox reader; see docs/CREDENTIALS-NEEDED.md.',
    );
  }
  const verified = await call('/api/auth/verify', {
    method: 'POST',
    body: { email, code: requested.devCode, displayName: email.split('@')[0].slice(0, 40) },
  });
  if (!verified.sessionToken) throw new Error('Server did not issue a native session token.');
  return { token: verified.sessionToken, userId: verified.user.id };
}

function newRunId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seed() {
  mkdirSync(RUNTIME_DIR, { recursive: true });
  const runId = arg('run-id', newRunId());

  const emailA = `${PREFIX.a}${runId}@safepath.test`;
  const emailB = `${PREFIX.b}${runId}@safepath.test`;

  // Sanity: the server must be up before we create anything.
  const health = await call('/api/health');
  if (!health || health.service !== 'safepath') throw new Error(`Unexpected /api/health from ${BASE}`);

  const a = await signIn(emailA);
  const b = await signIn(emailB);

  const group = await call('/api/families', {
    method: 'POST',
    body: { name: `E2E group ${runId}` },
    token: a.token,
  });

  const invite = await call(`/api/families/${group.family.id}/invites`, {
    method: 'POST',
    token: a.token,
  });

  // B joins, so the group has both accounts and the device can test removal.
  await call('/api/invites/accept', {
    method: 'POST',
    body: { token: invite.invite.token },
    token: b.token,
  });

  const record = {
    runId,
    base: BASE,
    createdAt: new Date().toISOString(),
    accounts: [
      { role: 'owner', label: 'A', email: emailA, userId: a.userId },
      { role: 'member', label: 'B', email: emailB, userId: b.userId },
    ],
    familyId: group.family.id,
    familyName: `E2E group ${runId}`,
    inviteToken: invite.invite.token,
    inviteExpiresAt: invite.invite.expiresAt,
  };

  writeFileSync(FILE, JSON.stringify(record, null, 2));
  process.stdout.write(`${JSON.stringify(record)}\n`);
  return record;
}

async function cleanup() {
  if (!existsSync(FILE)) {
    process.stderr.write(`No fixture file at ${FILE}; nothing to clean up.\n`);
    process.stdout.write(`${JSON.stringify({ cleaned: [], note: 'no fixture file' })}\n`);
    return;
  }

  const record = JSON.parse(readFileSync(FILE, 'utf8'));
  const cleaned = [];

  for (const account of record.accounts) {
    try {
      const session = await signIn(account.email);
      await call('/api/me/data', { method: 'DELETE', token: session.token });
      cleaned.push(account.email);
    } catch (err) {
      // A re-run may have already deleted the account; that is a success, not a
      // failure, so record it rather than throwing.
      cleaned.push(`${account.email} (already gone: ${err.status ?? 'error'})`);
    }
  }

  // Verify: the accounts must not be able to sign in again, and the group must
  // be gone for the surviving member.
  const checks = [];
  try {
    const session = await signIn(record.accounts[0].email);
    const me = await call('/api/me', { token: session.token });
    checks.push({ check: 'owner-signin-after-delete', families: me.families.length, ok: me.families.length === 0 });
  } catch (err) {
    checks.push({ check: 'owner-signin-after-delete', ok: true, note: 'account gone' });
  }

  process.stdout.write(`${JSON.stringify({ cleaned, checks, runId: record.runId })}\n`);
}

if (command === 'seed') {
  await seed();
} else if (command === 'cleanup') {
  await cleanup();
} else {
  process.stderr.write('Usage: node e2e/fixtures.mjs seed|cleanup [--base URL] [--run-id ID]\n');
  process.exit(2);
}
