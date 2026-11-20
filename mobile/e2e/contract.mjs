#!/usr/bin/env node
/**
 * Contract test: does the *mobile client's* request shape match the real server?
 *
 * The Jest suite mocks fetch, so it proves what the client sends, not that the
 * server accepts it. This script closes that gap without a device: it boots the
 * real server and replays the exact requests `src/api.ts` makes — same paths,
 * same headers, same bodies — then asserts the responses the app depends on.
 *
 * It caught one real mismatch while it was being written: the client posted an
 * invitation `code` while the server expected an opaque `token`.
 *
 *   node e2e/contract.mjs [--base http://127.0.0.1:8790]
 *
 * With no --base it starts its own server on a free port and shuts it down.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(here, '../../server/index.js');

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? `  ·  ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? `  ·  ${detail}` : ''}`);
  }
}

async function freePort() {
  return new Promise((res) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

const baseArg = process.argv.indexOf('--base');
const ownPort = await freePort();
const base = baseArg > 0 ? process.argv[baseArg + 1] : `http://127.0.0.1:${ownPort}`;

let child = null;
let dataDir = null;

if (baseArg < 0) {
  dataDir = mkdtempSync(join(tmpdir(), 'safepath-contract-'));
  child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATA_DIR: dataDir,
      PORT: String(ownPort),
      HOST: '127.0.0.1',
      DEV_DELIVERY: '1',
      SAFEPATH_SECRET: 'contract-test-only-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const shutdown = () => {
  if (child) child.kill('SIGTERM');
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
};
process.on('exit', shutdown);

/** Mirrors src/api.ts: mobile header on every call, bearer once signed in. */
async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'x-safepath-client': 'mobile', accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function signIn(email, displayName) {
  const requested = await call('/api/auth/request-code', { method: 'POST', body: { email } });
  const verified = await call('/api/auth/verify', {
    method: 'POST',
    body: { email, code: requested.body.devCode, displayName },
  });
  return { token: verified.body.sessionToken, user: verified.body.user, delivery: requested.body.delivery };
}

const stamp = Date.now().toString(36);
const emailA = `e2e-user-a-contract-${stamp}@safepath.test`;
const emailB = `e2e-user-b-contract-${stamp}@safepath.test`;

console.log(`\nContract test against ${base}\n`);

// --- sign-in exactly as the app does (mobile header => bearer token) ---
const a = await signIn(emailA, 'Contract A');
check('Sign-in returns a bearer token for the mobile header', Boolean(a.token), `HTTP 200, delivery=${a.delivery}`);
check('Server reports demo delivery so the app can warn on screen', a.delivery === 'dev');

// --- group + invitation, using the token endpoint ---
const family = await call('/api/families', { method: 'POST', body: { name: 'Contract group' }, token: a.token });
check('Creating a group works with the app\'s payload', family.status === 201, `HTTP ${family.status}`);

const invite = await call(`/api/families/${family.body.family.id}/invites`, { method: 'POST', token: a.token });
check('Invitation returns a token and a link', Boolean(invite.body.invite.token && invite.body.invite.link));

const b = await signIn(emailB, 'Contract B');
const accepted = await call('/api/invites/accept', {
  method: 'POST',
  body: { token: invite.body.invite.token },
  token: b.token,
});
check('The app\'s accept payload (opaque token) is accepted', accepted.status === 200, `HTTP ${accepted.status}`);
check('Joining does not authorise location', accepted.body.locationAuthorisedByInvite === false);
check('Joining leaves the new member not sharing', accepted.body.sharingState === 'off', accepted.body.sharingState);

// --- the flow the Share screen performs ---
const consent = await call('/api/me/consent', {
  method: 'POST', body: { scope: 'foreground', accepted: true }, token: a.token,
});
check('Consent is recorded before sharing', consent.status === 200, `HTTP ${consent.status}`);

const sharing = await call('/api/me/sharing', { method: 'POST', body: { state: 'on' }, token: a.token });
check('Sharing can be turned on', sharing.status === 200 && sharing.body.sharingState === 'on');

const meA = await call('/api/me', { token: a.token });
const memberIdA = meA.body.families[0].memberId;

const fix = {
  memberId: memberIdA,
  lat: 47.497912,
  lng: 19.040235,
  accuracyM: 12.5,
  capturedAt: Date.now(),
  source: 'foreground',
};
const posted = await call('/api/me/location', { method: 'POST', body: fix, token: a.token });
check('The app\'s fix payload is accepted', posted.status === 202, `HTTP ${posted.status}`);

// B shares too, so the viewer has a position of their own. The server only
// offers a distance when both sides have one; it will not invent a distance
// from nothing.
await call('/api/me/consent', { method: 'POST', body: { scope: 'foreground', accepted: true }, token: b.token });
await call('/api/me/sharing', { method: 'POST', body: { state: 'on' }, token: b.token });
const meB = await call('/api/me', { token: b.token });
await call('/api/me/location', {
  method: 'POST',
  token: b.token,
  body: {
    memberId: meB.body.families[0].memberId,
    lat: 47.5201,
    lng: 19.0802,
    accuracyM: 20,
    capturedAt: Date.now(),
    source: 'foreground',
  },
});

// --- what the other member sees ---
const view = await call(`/api/families/${family.body.family.id}`, { token: b.token });
const owner = view.body.members.find((m) => m.userId === a.user.id);
check('The other member sees the position', Boolean(owner?.location));
check('...with a server-computed state', owner?.location?.state === 'current', owner?.location?.state);
check('...with a capture timestamp', typeof owner?.location?.capturedAt === 'number');
check('...with an accuracy radius', typeof owner?.location?.accuracyM === 'number', `±${owner?.location?.accuracyM} m`);
check('...and a distance from the viewer', typeof owner?.distanceFromViewerM === 'number' && owner.distanceFromViewerM > 0,
  owner ? `${Math.round(owner.distanceFromViewerM)} m` : '');

// --- check-in while paused: allowed once, does not resume sharing ---
await call('/api/me/sharing', { method: 'POST', body: { state: 'paused' }, token: a.token });
const afterPause = await call(`/api/families/${family.body.family.id}`, { token: b.token });
const pausedOwner = afterPause.body.members.find((m) => m.userId === a.user.id);
check('Pausing removes the position from the group view', pausedOwner.location === null, pausedOwner.unavailableReason);

const checkin = await call('/api/me/checkin', {
  method: 'POST',
  body: { ...fix, capturedAt: Date.now(), source: 'checkin' },
  token: a.token,
});
check('A check-in is accepted while paused', checkin.status === 202, `HTTP ${checkin.status}`);

const afterCheckin = await call(`/api/families/${family.body.family.id}`, { token: a.token });
check('The check-in does not resume sharing', afterCheckin.body.viewer.sharingState === 'paused', afterCheckin.body.viewer.sharingState);

// --- the app\'s teardown paths ---
const leave = await call(`/api/families/${family.body.family.id}/leave`, { method: 'POST', token: b.token });
check('Leaving a group works', leave.status === 200, `HTTP ${leave.status}`);

const del = await call('/api/me/data', { method: 'DELETE', token: a.token });
check('Account deletion works', del.status === 200, `HTTP ${del.status}`);

const afterDelete = await call('/api/me', { token: a.token });
check('The deleted account\'s token stops working', afterDelete.status === 401, `HTTP ${afterDelete.status}`);

// The remaining account is the one created by this run; delete it too.
await call('/api/me/data', { method: 'DELETE', token: (await signIn(emailB, 'Contract B')).token });

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
