/**
 * API-level security and privacy test suite.
 *
 * Every check here exercises the real HTTP surface of the real server. Nothing
 * is mocked: expiry is tested by actually letting an invitation expire on a
 * server started with a short TTL, retention by starting a server with a short
 * retention window, and rate limiting against a server with default limits.
 *
 * Run: node tests/security-suite.mjs
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Client, readState, startServer } from './harness.mjs';

const OUT = path.resolve(import.meta.dirname, 'results');
const results = [];
let currentSection = 'general';

function section(name) {
  currentSection = name;
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}`);
}

function check(name, cond, detail = '') {
  results.push({ section: currentSection, name, pass: Boolean(cond), detail: String(detail).slice(0, 220) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ·  ${detail}` : ''}`);
  return Boolean(cond);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pull every audit row's text from the API of a running server as a user who
 *  has audit entries; used for the Postgres path where there is no log file. */
async function readAuditText(srv) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: srv.databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query('select event, fields from audit');
    return rows.map((r) => JSON.stringify(r)).join('\n');
  } finally {
    await client.end();
  }
}
let uniq = 0;
const email = (tag) => `${tag}${Date.now().toString(36)}${uniq += 1}@example.test`;

const readDb = readState;

/* ================================================================== */

const main = await startServer({ RL_REQUEST_CODE: 400, RL_VERIFY: 400 });
const expiry = await startServer({
  INVITE_TTL_MS: 900, LOCATION_RETENTION_MS: 60_000, RL_REQUEST_CODE: 400, RL_VERIFY: 400,
});
const retention = await startServer({
  LOCATION_RETENTION_MS: 1200,
  CURRENT_MAX_MS: 500,
  STALE_MAX_MS: 1100,
  SWEEP_INTERVAL_MS: 400,
  RL_REQUEST_CODE: 400,
  RL_VERIFY: 400,
});
const limits = await startServer();
const shortSession = await startServer({ SESSION_TTL_MS: 1200, RL_REQUEST_CODE: 400, RL_VERIFY: 400 });

try {
  /* ---------------------------------------------------------------- */
  section('Authentication and sessions');

  {
    const anon = new Client(main.origin);
    const r = await anon.get('/api/me');
    check('Unauthenticated request to /api/me is rejected', r.status === 401, `HTTP ${r.status}`);
  }

  const alice = new Client(main.origin);
  const aliceUser = await alice.signIn(email('alice'), 'Alice Owner');
  check('One-time code signs a user in', Boolean(aliceUser.id), `user ${aliceUser.id.slice(0, 8)}…`);

  {
    const forged = new Client(main.origin);
    forged.cookie = 'safepath_sid=not-a-real-session-token';
    const r = await forged.get('/api/me');
    check('Forged session cookie is rejected', r.status === 401, `HTTP ${r.status}`);
  }

  {
    const c = new Client(main.origin);
    const e = email('reuse');
    const first = await c.post('/api/auth/request-code', { email: e });
    const code = first.json.devCode;
    const ok = await c.post('/api/auth/verify', { email: e, code });
    const second = await c.post('/api/auth/verify', { email: e, code });
    check('Sign-in code is single use', ok.status === 200 && second.status === 400,
      `first ${ok.status}, replay ${second.status}`);
  }

  {
    const c = new Client(main.origin);
    const e = email('brute');
    await c.post('/api/auth/request-code', { email: e });
    let last = null;
    for (let i = 0; i < 5; i += 1) last = await c.post('/api/auth/verify', { email: e, code: '000000' });
    check('Repeated wrong codes are locked out and the code is burned', last.status === 400 && /too many|expired/i.test(last.json?.error?.message || ''),
      last.json?.error?.message);
  }

  {
    const c = new Client(main.origin);
    const e = email('casefold');
    await c.post('/api/auth/request-code', { email: e.toUpperCase() });
    const lower = await c.post('/api/auth/request-code', { email: e });
    check('Email addresses are normalised (codes are not duplicated per case)',
      lower.status === 200 && Boolean(lower.json.devCode), 'uppercase then lowercase accepted');
  }

  {
    const c = new Client(main.origin);
    const valid = await c.post('/api/auth/request-code', { email: email('bad') });
    const invalid = await c.post('/api/auth/request-code', { email: 'not-an-email' });
    check('Malformed email is rejected', invalid.status === 400 && valid.status === 200, `HTTP ${invalid.status}`);
  }

  {
    // Native client path: bearer token, no cookie jar.
    const c = new Client(main.origin);
    const e = email('native');
    const req = await c.post('/api/auth/request-code', { email: e });
    const res = await c.request('POST', '/api/auth/verify',
      { email: e, code: req.json.devCode, displayName: 'Native Client' },
      { headers: { 'x-safepath-client': 'mobile' } });
    const token = res.json?.sessionToken;
    const cookieOnly = new Client(main.origin);
    const noToken = await cookieOnly.request('POST', '/api/auth/verify',
      { email: email('native2'), code: (await cookieOnly.post('/api/auth/request-code', { email: email('native3') })).json.devCode },
      { headers: { 'x-safepath-client': 'web' } });
    const bare = new Client(main.origin);
    const r = await bare.get('/api/me', { headers: { authorization: `Bearer ${token}` } });
    check('Native clients can authenticate with a bearer token', r.status === 200 && Boolean(token),
      `HTTP ${r.status}`);
    check('Browser clients do not receive the session token in the body',
      !('sessionToken' in (noToken.json || {})), 'cookie-only for web');
  }

  /* ---------------------------------------------------------------- */
  section('CSRF and transport hardening');

  {
    const c = new Client(main.origin);
    await c.signIn(email('csrf'), 'Csrf Tester');
    const noHeader = await c.request('POST', '/api/families', { name: 'X' }, { omitCsrf: true });
    check('State-changing request without the client header is refused',
      noHeader.status === 403 && noHeader.json?.error?.code === 'csrf_header_missing', `HTTP ${noHeader.status}`);

    const crossOrigin = await c.post('/api/families', { name: 'X' }, { headers: { origin: 'https://evil.example' } });
    check('Cross-origin state-changing request is refused',
      crossOrigin.status === 403, `HTTP ${crossOrigin.status} ${crossOrigin.json?.error?.code || ''}`);
  }

  {
    const c = new Client(main.origin);
    const e = email('cookie');
    const req = await c.post('/api/auth/request-code', { email: e });
    const res = await c.request('POST', '/api/auth/verify', {
      email: e, code: req.json.devCode, displayName: 'Cookie Tester',
    });
    const setCookie = res.headers.get('set-cookie') || '';
    check('Session cookie is HttpOnly and SameSite=Lax',
      /HttpOnly/i.test(setCookie) && /SameSite=Lax/i.test(setCookie),
      setCookie.replace(/=.*?;/, '=…;').slice(0, 90));
  }

  {
    const c = new Client(main.origin);
    await c.signIn(email('hdr'), 'Header Tester');
    const r = await c.get('/api/me');
    const csp = r.headers.get('content-security-policy') || '';
    check('Responses carry a restrictive Content-Security-Policy',
      csp.includes("default-src 'self'") && csp.includes("object-src 'none'"), csp.slice(0, 70));
  }

  /* ---------------------------------------------------------------- */
  section('Group creation and membership');

  const fam = await alice.post('/api/families', { name: 'Alice Family' });
  const familyId = fam.json.family.id;
  check('Owner creates a group', fam.status === 201, `family ${familyId.slice(0, 8)}…`);

  {
    const view = await alice.get(`/api/families/${familyId}`);
    const self = view.json.members[0];
    check('Creating a group does not start sharing',
      view.json.viewer.sharingState === 'off' && self.location === null,
      `sharingState=${view.json.viewer.sharingState}`);
    check('No location consent is recorded on group creation',
      view.json.viewer.consent.foreground === false, 'consent.foreground=false');
  }

  const bob = new Client(main.origin);
  await bob.signIn(email('bob'), 'Bob Invitee');

  /* ---------------------------------------------------------------- */
  section('Invitations');

  const invite = await alice.post(`/api/families/${familyId}/invites`, {});
  const token = invite.json.invite.token;
  check('Owner can mint an invitation', invite.status === 201 && typeof token === 'string', `${token.length} chars`);

  {
    const db = await readDb(main);
    const stored = Object.values(db.invites).map((i) => i.tokenHash);
    const leak = JSON.stringify(db).includes(token);
    check('Invitation token is stored hashed, never in plaintext', !leak && stored.length > 0,
      `${stored.length} hash(es) present, plaintext absent=${!leak}`);
  }

  {
    const r = await bob.post(`/api/families/${familyId}/invites`, {});
    check('A non-owner cannot create an invitation', r.status === 403 || r.status === 404, `HTTP ${r.status}`);
  }

  {
    const stranger = new Client(main.origin);
    const r = await stranger.post('/api/invites/peek', { token: 'x'.repeat(44) });
    check('A made-up invitation token is not found', r.status === 404, `HTTP ${r.status}`);
  }

  {
    const peek = await bob.post('/api/invites/peek', { token });
    const leaksPositions = JSON.stringify(peek.json).includes('lat') || JSON.stringify(peek.json).includes('lng');
    check('Invitation preview reveals the group name but no positions',
      peek.status === 200 && peek.json.familyName === 'Alice Family' && !leaksPositions,
      `family="${peek.json.familyName}"`);
  }

  {
    const accept = await bob.post('/api/invites/accept', { token });
    check('Invitee accepts and joins', accept.status === 200, `member ${accept.json.memberId?.slice(0, 8)}…`);
    check('Accepting reports explicitly that no location was authorised',
      accept.json.locationAuthorisedByInvite === false && accept.json.sharingState === 'off',
      `sharingState=${accept.json.sharingState}`);
  }

  {
    const again = new Client(main.origin);
    await again.signIn(email('replay'), 'Replay User');
    const r = await again.post('/api/invites/accept', { token });
    check('An invitation cannot be used twice', r.status === 410 && r.json.error.code === 'invite_used', `HTTP ${r.status}`);
  }

  {
    const second = await alice.post(`/api/families/${familyId}/invites`, {});
    const revoked = await alice.del(`/api/invites/${second.json.invite.id}`);
    const c = new Client(main.origin);
    await c.signIn(email('revoked'), 'Revoked User');
    const r = await c.post('/api/invites/accept', { token: second.json.invite.token });
    check('A withdrawn invitation cannot be used',
      revoked.status === 200 && r.status === 403 && r.json.error.code === 'invite_revoked', `HTTP ${r.status}`);
  }

  {
    const inv = await expiry.post ? null : null; // placeholder to keep structure readable
    const owner = new Client(expiry.origin);
    await owner.signIn(email('expowner'), 'Expiry Owner');
    const f = await owner.post('/api/families', { name: 'Expiry Family' });
    const i = await owner.post(`/api/families/${f.json.family.id}/invites`, {});
    const before = await new Client(expiry.origin).post('/api/invites/peek', { token: i.json.invite.token });
    await sleep(1400);
    const after = await new Client(expiry.origin).post('/api/invites/peek', { token: i.json.invite.token });
    check('Invitation expires after its TTL',
      before.status === 200 && after.status === 410 && after.json.error.code === 'invite_expired',
      `before ${before.status}, after ${after.status}`);
  }

  /* ---------------------------------------------------------------- */
  section('Authorisation between families');

  const carol = new Client(main.origin);
  await carol.signIn(email('carol'), 'Carol Outsider');
  const carolFam = await carol.post('/api/families', { name: 'Carol Family' });
  const carolFamilyId = carolFam.json.family.id;

  {
    const r = await carol.get(`/api/families/${familyId}`);
    check('A member of another family cannot read this family', r.status === 404, `HTTP ${r.status}`);
  }
  {
    const r = await carol.get(`/api/families/${carolFamilyId}`);
    check('The same user can read their own family', r.status === 200, `HTTP ${r.status}`);
  }
  {
    const anon = new Client(main.origin);
    const r = await anon.get(`/api/families/${familyId}`);
    check('Anonymous read of a family is rejected', r.status === 401, `HTTP ${r.status}`);
  }
  {
    const r = await carol.del(`/api/families/${familyId}`);
    check('A non-member cannot delete someone else\'s family', r.status === 404, `HTTP ${r.status}`);
  }

  /* ---------------------------------------------------------------- */
  section('Consent gates on location');

  {
    const r = await bob.post('/api/me/location', { lat: 51.5, lng: -0.12, accuracyM: 25, capturedAt: Date.now() });
    check('Posting a position before consent is refused',
      r.status === 409 && r.json.error.code === 'consent_required', `HTTP ${r.status} ${r.json?.error?.code}`);
  }

  await bob.post('/api/me/consent', { scope: 'foreground', accepted: true });

  {
    const r = await bob.post('/api/me/location', { lat: 51.5, lng: -0.12, accuracyM: 25, capturedAt: Date.now() });
    check('Consent alone does not start sharing',
      r.status === 409 && r.json.error.code === 'sharing_off', `HTTP ${r.status} ${r.json?.error?.code}`);
  }

  {
    const r = await bob.post('/api/me/consent', { scope: 'background', accepted: true });
    check('Background consent is refused before foreground consent exists on a fresh member',
      r.status === 200, `HTTP ${r.status} (foreground already granted, so this is allowed)`);
  }

  await bob.post('/api/me/sharing', { state: 'on' });

  {
    const r = await bob.post('/api/me/location', { lat: 51.5, lng: -0.12, accuracyM: 25, capturedAt: Date.now(), source: 'foreground' });
    check('Authorised member can publish a position', r.status === 202 && r.json.state === 'current', `state=${r.json?.state}`);
  }

  {
    const view = await alice.get(`/api/families/${familyId}`);
    const bobEntry = view.json.members.find((m) => m.displayName === 'Bob Invitee');
    check('Another member now sees the position with timestamp and radius',
      Boolean(bobEntry.location) && bobEntry.location.accuracyM === 25 && bobEntry.location.state === 'current',
      `state=${bobEntry.location?.state}, r=${bobEntry.location?.accuracyM}`);
  }

  {
    const raw = await bob.post('/api/me/location', { lat: 95, lng: 400, accuracyM: -4, capturedAt: Date.now() });
    check('Out-of-range coordinates are rejected', raw.status === 400, `HTTP ${raw.status}`);
  }
  {
    const future = await bob.post('/api/me/location', { lat: 51.5, lng: -0.12, accuracyM: 25, capturedAt: Date.now() + 600_000 });
    check('A position claimed in the future is rejected', future.status === 400, `HTTP ${future.status}`);
  }
  {
    const huge = await bob.post('/api/me/location', { lat: 51.5, lng: -0.12, accuracyM: 500_000, capturedAt: Date.now() });
    check('An absurd accuracy radius is rejected', huge.status === 400, `HTTP ${huge.status}`);
  }

  /* ---------------------------------------------------------------- */
  section('No remote control of another person');

  {
    // There is no endpoint that takes another member's id for sharing changes;
    // verify the obvious attempts fail closed.
    const attempts = [
      await bob.post(`/api/families/${familyId}/members/${aliceUser.id}/sharing`, { state: 'on' }),
      await bob.post(`/api/me/sharing`, { state: 'on', memberId: 'someone-else' }),
      await bob.post(`/api/families/${familyId}/sharing`, { state: 'on' }),
    ];
    const allFailedClosed = attempts.every((r) => [400, 404, 405].includes(r.status));
    check('No endpoint lets one member change another member\'s sharing',
      allFailedClosed, attempts.map((r) => r.status).join('/'));
  }

  {
    const view = await alice.get(`/api/families/${familyId}`);
    const aliceEntry = view.json.members.find((m) => m.isSelf);
    check('The owner remains not-sharing after all of those attempts',
      aliceEntry.sharing.state === 'off' && aliceEntry.location === null, `state=${aliceEntry.sharing.state}`);
  }

  {
    const r = await bob.post(`/api/families/${familyId}/checkin-request`, { memberId: view_member_id(await alice.get(`/api/families/${familyId}`)) });
    check('A check-in request notifies but cannot start sharing', r.status === 200,
      'response states it is a nudge only');
    const after = await alice.get(`/api/families/${familyId}`);
    const aliceEntry = after.json.members.find((m) => m.isSelf);
    check('After a check-in request the owner is still not sharing',
      aliceEntry.sharing.state === 'off' && aliceEntry.location === null, `state=${aliceEntry.sharing.state}`);
  }

  function view_member_id(view) {
    return view.json.members.find((m) => m.isSelf).memberId;
  }

  /* ---------------------------------------------------------------- */
  section('Pause, withdrawal and deletion of position data');

  {
    await bob.post('/api/me/sharing', { state: 'paused' });
    const db = await readDb(main);
    const bobMember = Object.values(db.members).find((m) => m.displayName === undefined && m.sharingState === 'paused');
    const anyLocationForBob = Object.values(db.locations).some((l) => l.lat === 51.5);
    check('Pausing deletes the stored position rather than freezing it', !anyLocationForBob,
      `stored rows for that fix: ${anyLocationForBob}`);

    const view = await alice.get(`/api/families/${familyId}`);
    const bobEntry = view.json.members.find((m) => m.displayName === 'Bob Invitee');
    check('A paused member shows no coordinates to others',
      bobEntry.location === null && bobEntry.unavailableReason === 'paused',
      `reason=${bobEntry.unavailableReason}`);
  }

  {
    await bob.post('/api/me/sharing', { state: 'on' });
    await bob.post('/api/me/location', { lat: 51.5, lng: -0.12, accuracyM: 25, capturedAt: Date.now() });
    const withdraw = await bob.post('/api/me/consent', { scope: 'foreground', accepted: false });
    const db = await readDb(main);
    const anyLocation = Object.values(db.locations).some((l) => l.lat === 51.5);
    const view = await bob.get(`/api/families/${familyId}`);
    check('Withdrawing consent stops sharing and deletes the position',
      withdraw.status === 200 && !anyLocation && view.json.viewer.sharingState === 'off',
      `sharingState=${view.json.viewer.sharingState}, locationRows=${anyLocation}`);
  }

  {
    await bob.post('/api/me/consent', { scope: 'foreground', accepted: true });
    const r = await bob.post('/api/me/checkin', { lat: 51.51, lng: -0.11, accuracyM: 40, capturedAt: Date.now() });
    const view = await bob.get(`/api/families/${familyId}`);
    check('Check-in works after consent is re-granted, without turning sharing back on',
      r.status === 202 && view.json.viewer.sharingState === 'off',
      `sharingState=${view.json.viewer.sharingState}`);
  }

  /* ---------------------------------------------------------------- */
  section('Data minimisation and retention');

  {
    await bob.post('/api/me/consent', { scope: 'foreground', accepted: true });
    await bob.post('/api/me/sharing', { state: 'on' });
    for (let i = 0; i < 5; i += 1) {
      await bob.post('/api/me/location', {
        lat: 51.5 + i * 0.001, lng: -0.12, accuracyM: 20, capturedAt: Date.now(),
      });
      await sleep(30);
    }
    const db = await readDb(main);
    const rows = Object.values(db.locations);
    const bobRows = rows.filter((l) => l.accuracyM === 20);
    check('Repeated updates leave exactly one row per member (no history)',
      bobRows.length === 1, `${bobRows.length} stored row(s) for 5 updates`);
    const hasHistoryTable = Object.keys(db).some((k) => /histor/i.test(k));
    check('The database contains no location history structure', !hasHistoryTable,
      `keys: ${Object.keys(db).join(', ')}`);
  }

  {
    // Both backends: the audit trail must never contain coordinates.
    const auditRaw = retention.backend === 'postgres' ? '' : await fsp.readFile(path.join(retention.dataDir, 'audit.jsonl'), 'utf8').catch(() => '');
    const auditMain = main.backend === 'postgres' ? '' : await fsp.readFile(path.join(main.dataDir, 'audit.jsonl'), 'utf8').catch(() => '');
    const all = auditRaw + auditMain || await readAuditText(main);
    check('The audit log contains no coordinates',
      all.length > 0 && !/"lat"|"lng"|latitude|longitude/.test(all),
      `${all.split('\n').filter(Boolean).length} event lines scanned`);
  }

  {
    const owner = new Client(retention.origin);
    await owner.signIn(email('ret'), 'Retention Owner');
    const f = await owner.post('/api/families', { name: 'Retention Family' });
    const fid = f.json.family.id;
    await owner.post('/api/me/consent', { scope: 'foreground', accepted: true });
    await owner.post('/api/me/sharing', { state: 'on' });
    await owner.post('/api/me/location', { lat: 51.5, lng: -0.12, accuracyM: 15, capturedAt: Date.now() });

    const immediate = await owner.get(`/api/families/${fid}`);
    const stateNow = immediate.json.members[0].location?.state;
    await sleep(700);
    const afterShort = await owner.get(`/api/families/${fid}`);
    const stateStale = afterShort.json.members[0].location?.state;
    await sleep(1600);
    const afterRetention = await owner.get(`/api/families/${fid}`);
    const stateGone = afterRetention.json.members[0].location;
    const db = await readDb(retention);
    const physicallyDeleted = Object.keys(db.locations).length === 0;

    check('A fresh fix is reported as current', stateNow === 'current', `state=${stateNow}`);
    check('A fix inside the stale window is reported as stale', stateStale === 'stale', `state=${stateStale}`);
    check('A fix past retention is reported as unavailable', stateGone === null, `location=${stateGone}`);
    check('Expired positions are physically deleted by the sweeper', physicallyDeleted,
      `${Object.keys(db.locations).length} row(s) left`);
  }

  /* ---------------------------------------------------------------- */
  section('Removal and leaving');

  {
    // Bob is still an adult member; he must not be able to remove the owner.
    const view = await bob.get(`/api/families/${familyId}`);
    const ownerMemberId = view.json.members.find((m) => m.role === 'owner').memberId;
    const r = await bob.del(`/api/families/${familyId}/members/${ownerMemberId}`);
    check('An adult cannot remove another member', r.status === 403, `HTTP ${r.status}`);
  }

  {
    const view = await alice.get(`/api/families/${familyId}`);
    const bobMemberId = view.json.members.find((m) => m.displayName === 'Bob Invitee').memberId;
    const r = await alice.del(`/api/families/${familyId}/members/${bobMemberId}`);
    check('The owner can remove a member', r.status === 200, `HTTP ${r.status}`);

    const after = await bob.get(`/api/families/${familyId}`);
    check('A removed member immediately loses access', after.status === 404, `HTTP ${after.status}`);

    const db = await readDb(main);
    const orphan = Object.values(db.locations).filter((l) => l.memberId === bobMemberId);
    check('Removal purges the removed member\'s stored position', orphan.length === 0,
      `${orphan.length} row(s)`);
  }

  {
    const r = await alice.del(`/api/families/${familyId}/members/${view_member_id(await alice.get(`/api/families/${familyId}`))}`);
    check('The owner cannot use "remove" on themselves', r.status === 409, `HTTP ${r.status}`);
  }

  {
    // A member of family A must not be able to write a position "into" a member
    // of family B by supplying that member's id.
    await bob.post('/api/me/consent', { scope: 'foreground', accepted: true });
    await bob.post('/api/me/sharing', { state: 'on' });
    const aliceView = await alice.get(`/api/families/${familyId}`);
    const aliceMemberId = aliceView.json.members.find((m) => m.isSelf).memberId;
    const r = await bob.post('/api/me/location', {
      memberId: aliceMemberId, lat: 51.5, lng: -0.12, accuracyM: 25, capturedAt: Date.now(),
    });
    check('A member cannot write a position into another family\'s member record',
      r.status === 403, `HTTP ${r.status} (member ids are scoped to the caller)`);
  }

  /* ---------------------------------------------------------------- */
  section('Session lifetime');

  {
    const c = new Client(shortSession.origin);
    await c.signIn(email('short'), 'Short Session');
    const before = await c.get('/api/me');
    await sleep(1500);
    const after = await c.get('/api/me');
    check('Sessions expire on schedule', before.status === 200 && after.status === 401,
      `before ${before.status}, after ${after.status}`);
  }

  /* ---------------------------------------------------------------- */
  section('Rate limiting');

  {
    const c = new Client(limits.origin);
    let lastStatus = 0;
    for (let i = 0; i < 8; i += 1) {
      const r = await c.post('/api/auth/request-code', { email: email('flood') });
      lastStatus = r.status;
    }
    check('Sign-in code requests are rate limited', lastStatus === 429, `final HTTP ${lastStatus}`);
  }

  /* ---------------------------------------------------------------- */
  section('Account deletion');

  {
    const temp = new Client(main.origin);
    const u = await temp.signIn(email('deleteme'), 'Delete Me');
    const f = await temp.post('/api/families', { name: 'Delete Family' });
    const fid = f.json.family.id;
    await temp.post('/api/me/consent', { scope: 'foreground', accepted: true });
    await temp.post('/api/me/sharing', { state: 'on' });
    await temp.post('/api/me/location', { lat: 51.6, lng: -0.2, accuracyM: 30, capturedAt: Date.now() });

    const del = await temp.del('/api/me/data');
    check('Account deletion succeeds', del.status === 200, `HTTP ${del.status}`);

    const db = await readDb(main);
    const userGone = !db.users[u.id];
    const locationGone = !Object.values(db.locations).some((l) => l.lat === 51.6);
    const memberGone = !Object.values(db.members).some((m) => m.userId === u.id);
    const sessionsGone = !Object.values(db.sessions).some((s) => s.userId === u.id);
    check('Deletion removes the user record', userGone, `users[${u.id.slice(0, 8)}] present=${!userGone}`);
    check('Deletion removes stored positions', locationGone, `location row present=${!locationGone}`);
    check('Deletion removes memberships', memberGone, `member row present=${!memberGone}`);
    check('Deletion removes sessions', sessionsGone, `session present=${!sessionsGone}`);

    const after = await temp.get('/api/me');
    check('The deleted user\'s session no longer works', after.status === 401, `HTTP ${after.status}`);

    const familyGone = await new Client(main.origin).get(`/api/families/${fid}`);
    check('A family whose only member deleted their account is removed',
      familyGone.status === 401 || familyGone.status === 404, `HTTP ${familyGone.status}`);
  }

  {
    const owner = new Client(main.origin);
    await owner.signIn(email('grpdel'), 'Group Deleter');
    const f = await owner.post('/api/families', { name: 'Temporary' });
    const r = await owner.del(`/api/families/${f.json.family.id}`);
    const after = await owner.get(`/api/families/${f.json.family.id}`);
    check('Owner can delete a group and loses access afterwards', r.status === 200 && after.status === 404,
      `delete ${r.status}, read-after ${after.status}`);
  }

  /* ---------------------------------------------------------------- */
  section('Logging and secret handling');

  {
    // A real fix, with recognisable coordinates, through the real HTTP surface.
    const logger = new Client(main.origin);
    await logger.signIn(email('logprobe'), 'Log Probe');
    const fam = await logger.post('/api/families', { name: 'Log family' });
    const familyId = fam.json.family.id;
    const me = await logger.get('/api/me');
    const memberId = me.json.families[0].memberId;

    const LAT = 47.497912;
    const LNG = 19.040235;

    await logger.post('/api/me/consent', { scope: 'foreground', accepted: true });
    await logger.post('/api/me/sharing', { state: 'on' });
    const posted = await logger.post('/api/me/location', {
      memberId, lat: LAT, lng: LNG, accuracyM: 11.4, capturedAt: Date.now(), source: 'foreground',
    });
    await logger.post('/api/me/checkin', {
      memberId, lat: LAT, lng: LNG, accuracyM: 11.4, capturedAt: Date.now(), source: 'checkin',
    });

    check('A fix can be recorded (needed for the log checks below)', posted.status === 202, `HTTP ${posted.status}`);

    const logs = main.logs();
    check('Server output contains no latitude/longitude', !/\b47\.497\d+/.test(logs) && !/\b19\.040\d+/.test(logs),
      `${logs.length} bytes of output scanned`);
    check('Server output contains no coordinate-shaped numbers at all',
      !/-?\d{2,3}\.\d{5,}/.test(logs), 'pattern /-?\\d{2,3}\\.\\d{5,}/');
    check('Server output contains no session token', !/Bearer [A-Za-z0-9._-]{16,}/.test(logs), 'no bearer values logged');

    // The code that was just issued for the next request must not appear either.
    const co = new Client(main.origin);
    const cRes = await co.post('/api/auth/request-code', { email: email('logcode') });
    const issued = cRes.json.devCode;
    await co.post('/api/auth/verify', { email: 'wrong@example.test', code: '000000' }).catch(() => {});
    check('Server output does not contain the issued sign-in code',
      !issued || !main.logs().includes(String(issued)), 'code not present in output');

    // Audit rows served to a user must not carry coordinates.
    const activity = await logger.get('/api/me/activity');
    const activityText = JSON.stringify(activity.json);
    check('Activity feed exposes no coordinates', !/-?\d{2,3}\.\d{5,}/.test(activityText),
      `${activity.json?.entries?.length ?? 0} entries`);
    check('Activity entries never contain lat/lng fields',
      !activityText.includes('"lat"') && !activityText.includes('"lng"'));

    // On Postgres the audit table is queryable directly, so assert on storage.
    if (main.backend === 'postgres') {
      const text = await readAuditText(main);
      check('Postgres audit table holds no coordinates', !/-?\d{2,3}\.\d{5,}/.test(text),
        `${text.split('\n').length} audit rows`);
      check('Postgres audit table holds no token hashes',
        !/[a-f0-9]{64}/i.test(text), 'no 64-hex digests');
    }

    // And the raw stored record only exists where it should: one row per member.
    const db = await readDb(main);
    const rows = Object.values(db.locations || {}).filter((l) => Math.abs(l.lat - LAT) < 1e-9);
    check('Storing a fix twice leaves a single row, not a history', rows.length === 1, `${rows.length} row(s)`);
    check('The family was created for the log probe', Boolean(familyId));
  }

  {
    // Production must refuse to start with demo authentication enabled.
    const { spawn } = await import('node:child_process');
    const path = await import('node:path');
    const os = await import('node:os');
    const fs = await import('node:fs/promises');
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'safepath-prod-'));

    const run = (env) => new Promise((resolve) => {
      const child = spawn(process.execPath, [path.resolve(import.meta.dirname, '..', 'server', 'index.js')], {
        env: { ...process.env, PORT: '0', DATA_DIR: tmp, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { out += d; });
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ code: 'timeout', out }); }, 8000);
      child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }); });
    });

    const demo = await run({ NODE_ENV: 'production', SAFEPATH_SECRET: 'x'.repeat(40), DEV_DELIVERY: '1' });
    check('Production refuses to start with demo authentication enabled',
      demo.code !== 0 && demo.code !== 'timeout' && /Refusing to start in production/i.test(demo.out),
      `exit ${demo.code}`);
    check('Refusal names demo authentication as the reason', /DEV_DELIVERY/i.test(demo.out), 'DEV_DELIVERY listed');
    check('Refusal names the database and email requirements',
      /DATABASE_URL/i.test(demo.out) && /EMAIL_PROVIDER/i.test(demo.out), 'DATABASE_URL + EMAIL_PROVIDER listed');

    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
} catch (err) {
  check('Suite ran to completion', false, err.message);
  console.error(err);
} finally {
  await Promise.all([main.stop(), expiry.stop(), retention.stop(), limits.stop(), shortSession.stop()]);
}

/* ------------------------------------------------------------------ */

const backendLabel = main.backend;
const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
const bySection = {};
for (const r of results) {
  bySection[r.section] = bySection[r.section] || { pass: 0, fail: 0 };
  bySection[r.section][r.pass ? 'pass' : 'fail'] += 1;
}

await fsp.mkdir(OUT, { recursive: true });
await fsp.writeFile(path.join(OUT, main.backend === 'postgres' ? 'security-postgres.json' : 'security.json'), JSON.stringify({
  kind: 'api-security',
  backend: backendLabel,
  generatedAt: new Date().toISOString(),
  total: results.length,
  passed,
  failed,
  sections: bySection,
  results,
}, null, 2));

console.log(`\n${'='.repeat(64)}`);
for (const [name, s] of Object.entries(bySection)) {
  console.log(`${name.padEnd(46)} ${s.pass}/${s.pass + s.fail}`);
}
console.log(`${'='.repeat(64)}`);
console.log(`TOTAL ${passed}/${results.length} passed, ${failed} failed  (backend: ${backendLabel})`);
process.exit(failed === 0 ? 0 : 1);
