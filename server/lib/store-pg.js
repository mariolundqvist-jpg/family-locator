/**
 * Postgres-backed store.
 *
 * Implements the same contract as the JSON store so that every authorisation
 * rule, consent gate and retention rule is identical across both backends —
 * the security suite runs against both and must pass on both.
 *
 *   store.init()
 *   await store.snapshot()          -> a plain object shaped like the JSON db
 *   await store.mutate(fn)          -> runs fn(db) with the same shape, atomically
 *   await store.audit(entry)
 *   await store.readAudit(limit)
 *   await store.sweep(now, policy)
 *
 * CONCURRENCY: mutations take a transaction-scoped advisory lock, load a
 * consistent snapshot, run the callback, then persist only the rows that
 * changed. That makes invite consumption, membership changes and deletions
 * atomic across processes — the property the JSON store cannot offer.
 *
 * SCALE NOTE (deliberate, documented): each mutation loads all rows of the
 * entity tables. That is correct and fine to a few hundred families, and is the
 * part that must be replaced with targeted queries before ~1,000 families. The
 * schema already carries the indexes that migration needs; nothing else about
 * the authorisation model changes. See docs/ARCHITECTURE.md §6.
 */
import pg from 'pg';

const TABLES = ['users', 'sessions', 'families', 'members', 'invites', 'locations', 'codes'];

const EMPTY = {
  version: 1,
  users: {},
  sessions: {},
  families: {},
  members: {},
  invites: {},
  locations: {},
  codes: {},
};

export class PgStore {
  constructor(connectionString, { max = 10, ssl } = {}) {
    this.connectionString = connectionString;
    const isSsl = ssl === true || ssl === 'true' || ssl === '1' ||
      (typeof connectionString === 'string' && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1'));
    this.pool = new pg.Pool({
      connectionString,
      max,
      ssl: isSsl ? { rejectUnauthorized: false } : (ssl || false),
      // A prototype should fail fast rather than hang a request for 30s.
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10_000,
    });
    this.pool.on('error', (err) => {
      // Never log the connection string or query text: it may contain values.
      console.error('[pg] idle client error', err.code || 'unknown');
    });
  }

  async init() {
    const client = await this.pool.connect();
    try {
      // Fail fast with a clear message if the schema has not been applied.
      const { rows } = await client.query(
        `select count(*)::int as n from information_schema.tables
          where table_schema = 'public'
            and table_name in ('users','sessions','families','members','invites','locations','signin_codes','audit')`,
      );
      if (rows[0].n < 8) {
        throw new Error('Database schema is missing. Run: node tools/migrate.mjs');
      }
    } finally {
      client.release();
    }
    return this;
  }

  /* ---------------- reads ---------------- */

  async snapshot() {
    const client = await this.pool.connect();
    try {
      return await loadAll(client);
    } finally {
      client.release();
    }
  }

  /* ---------------- writes ---------------- */

  async mutate(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      // Serialise every mutation. Cheap, explicit, and the reason two people
      // cannot spend the same invitation at the same moment.
      await client.query("select pg_advisory_xact_lock(hashtext('safepath.mutate'))");

      const before = await loadAll(client);
      const after = structuredClone(before);

      const result = fn(after);

      await persistDiff(client, before, after);
      await client.query('commit');
      return result;
    } catch (err) {
      try { await client.query('rollback'); } catch { /* connection may be gone */ }
      throw err;
    } finally {
      client.release();
    }
  }

  async audit(entry) {
    const { event, userId, familyId, ...fields } = entry;
    // Belt and braces: refuse to persist anything that looks like a coordinate
    // or a credential, whatever the caller meant to pass.
    const clean = sanitiseAuditFields(fields);
    await this.pool.query(
      'insert into audit (event, user_id, family_id, fields) values ($1,$2,$3,$4)',
      [event, userId || null, familyId || null, JSON.stringify(clean)],
    );
  }

  async readAudit(limit = 200) {
    const { rows } = await this.pool.query(
      `select id, ts, event, user_id, family_id, fields
         from audit order by id desc limit $1`,
      [Math.min(Number(limit) || 200, 1000)],
    );
    return rows.map((r) => ({
      ts: r.ts instanceof Date ? r.ts.toISOString() : String(r.ts),
      event: r.event,
      userId: r.user_id || undefined,
      familyId: r.family_id || undefined,
      ...(r.fields || {}),
    }));
  }

  async sweep(now, policy) {
    // Delete directly rather than load-modify-save: this is a housekeeping job,
    // not an authorisation decision.
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const loc = await client.query('delete from locations where captured_at < $1', [now - policy.locationRetentionMs]);
      await client.query('delete from sessions where expires_at < $1 or last_seen_at < $2',
        [now, now - policy.sessionIdleMs]);
      await client.query('delete from signin_codes where expires_at < $1', [now]);
      await client.query(
        'delete from invites where used_at is null and revoked_at is null and expires_at < $1',
        [now - 24 * 60 * 60 * 1000],
      );
      await client.query('commit');
      return loc.rowCount;
    } catch (err) {
      try { await client.query('rollback'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

/* ------------------------------------------------------------------ */
/* Row mapping                                                         */
/* ------------------------------------------------------------------ */

async function loadAll(client) {
  const db = structuredClone(EMPTY);

  const users = await client.query('select * from users');
  for (const r of users.rows) {
    db.users[r.id] = {
      id: r.id, email: r.email, displayName: r.display_name,
      createdAt: Number(r.created_at), lastSeenAt: Number(r.last_seen_at),
    };
  }

  const sessions = await client.query('select * from sessions');
  for (const r of sessions.rows) {
    db.sessions[r.id] = {
      userId: r.user_id, createdAt: Number(r.created_at), lastSeenAt: Number(r.last_seen_at),
      expiresAt: Number(r.expires_at), ip: r.ip, userAgent: r.user_agent,
    };
  }

  const families = await client.query('select * from families');
  for (const r of families.rows) {
    db.families[r.id] = {
      id: r.id, name: r.name, ownerId: r.owner_id, createdAt: Number(r.created_at),
    };
  }

  const members = await client.query('select * from members');
  for (const r of members.rows) {
    db.members[r.id] = {
      id: r.id,
      familyId: r.family_id,
      userId: r.user_id,
      role: r.role,
      state: r.state,
      joinedAt: Number(r.joined_at),
      ...(r.left_at ? { leftAt: Number(r.left_at) } : {}),
      ...(r.removed_at ? { removedAt: Number(r.removed_at) } : {}),
      sharingState: r.sharing_state,
      sharingUpdatedAt: Number(r.sharing_updated_at),
      consent: r.consent || {},
      ...(r.extra || {}),
    };
  }

  const invites = await client.query('select * from invites');
  for (const r of invites.rows) {
    db.invites[r.id] = {
      id: r.id, familyId: r.family_id, createdByUserId: r.created_by,
      tokenHash: r.token_hash, createdAt: Number(r.created_at), expiresAt: Number(r.expires_at),
      usedAt: r.used_at ? Number(r.used_at) : null,
      usedByUserId: r.used_by || null,
      revokedAt: r.revoked_at ? Number(r.revoked_at) : null,
    };
  }

  const locations = await client.query('select * from locations');
  for (const r of locations.rows) {
    db.locations[r.member_id] = {
      memberId: r.member_id, familyId: r.family_id, userId: r.user_id,
      lat: Number(r.lat), lng: Number(r.lng), accuracyM: Number(r.accuracy_m),
      capturedAt: Number(r.captured_at), receivedAt: Number(r.received_at), source: r.source,
    };
  }

  const codes = await client.query('select * from signin_codes');
  for (const r of codes.rows) {
    db.codes[r.email] = {
      email: r.email, hash: r.hash, createdAt: Number(r.created_at),
      expiresAt: Number(r.expires_at), attempts: Number(r.attempts),
    };
  }

  return db;
}

/** Compare per-entity JSON and write only what changed. */
async function persistDiff(client, before, after) {
  // users
  for (const [id, u] of Object.entries(after.users)) {
    if (jsonEq(before.users[id], u)) continue;
    await client.query(
      `insert into users (id,email,display_name,created_at,last_seen_at)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do update set email=$2, display_name=$3, created_at=$4, last_seen_at=$5`,
      [u.id, u.email, u.displayName, u.createdAt, u.lastSeenAt],
    );
  }
  for (const id of Object.keys(before.users)) if (!after.users[id]) await client.query('delete from users where id=$1', [id]);

  // sessions
  for (const [id, s] of Object.entries(after.sessions)) {
    if (jsonEq(before.sessions[id], s)) continue;
    // Sessions can belong to a user whose row is being deleted in the same
    // transaction; the FK would fail. Insert users first (done above), and skip
    // sessions whose user is gone entirely.
    if (!after.users[s.userId]) continue;
    await client.query(
      `insert into sessions (id,user_id,created_at,last_seen_at,expires_at,ip,user_agent)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update set last_seen_at=$4, expires_at=$5, ip=$6, user_agent=$7`,
      [id, s.userId, s.createdAt, s.lastSeenAt, s.expiresAt, s.ip || null, s.userAgent || null],
    );
  }
  for (const id of Object.keys(before.sessions)) if (!after.sessions[id]) await client.query('delete from sessions where id=$1', [id]);

  // families
  for (const [id, f] of Object.entries(after.families)) {
    if (jsonEq(before.families[id], f)) continue;
    await client.query(
      `insert into families (id,name,owner_id,created_at) values ($1,$2,$3,$4)
       on conflict (id) do update set name=$2, owner_id=$3`,
      [id, f.name, f.ownerId || null, f.createdAt],
    );
  }
  for (const id of Object.keys(before.families)) if (!after.families[id]) await client.query('delete from families where id=$1', [id]);

  // members
  for (const [id, m] of Object.entries(after.members)) {
    if (jsonEq(before.members[id], m)) continue;
    if (!after.families[m.familyId]) continue;
    const extra = {};
    for (const k of ['backgroundStoppedAt', 'checkInRequests', 'lastCheckInRequestAt', 'lastCheckInRequestFrom', 'anonymised']) {
      if (m[k] !== undefined) extra[k] = m[k];
    }
    await client.query(
      `insert into members
         (id,family_id,user_id,role,state,joined_at,left_at,removed_at,sharing_state,sharing_updated_at,consent,extra)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (id) do update set
         role=$4, state=$5, left_at=$7, removed_at=$8,
         sharing_state=$9, sharing_updated_at=$10, consent=$11, extra=$12`,
      [id, m.familyId, m.userId, m.role, m.state, m.joinedAt, m.leftAt || null, m.removedAt || null,
        m.sharingState, m.sharingUpdatedAt, JSON.stringify(m.consent || {}), JSON.stringify(extra)],
    );
  }
  for (const id of Object.keys(before.members)) if (!after.members[id]) await client.query('delete from members where id=$1', [id]);

  // invites
  for (const [id, i] of Object.entries(after.invites)) {
    if (jsonEq(before.invites[id], i)) continue;
    if (!after.families[i.familyId]) continue;
    await client.query(
      `insert into invites (id,family_id,created_by,token_hash,created_at,expires_at,used_at,used_by,revoked_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do update set used_at=$7, used_by=$8, revoked_at=$9`,
      [id, i.familyId, i.createdByUserId, i.tokenHash, i.createdAt, i.expiresAt,
        i.usedAt || null, i.usedByUserId || null, i.revokedAt || null],
    );
  }
  for (const id of Object.keys(before.invites)) if (!after.invites[id]) await client.query('delete from invites where id=$1', [id]);

  // locations — insert/update/delete, never append
  for (const [memberId, l] of Object.entries(after.locations)) {
    if (jsonEq(before.locations[memberId], l)) continue;
    if (!after.members[memberId]) continue;
    await client.query(
      `insert into locations (member_id,family_id,user_id,lat,lng,accuracy_m,captured_at,received_at,source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (member_id) do update set
         lat=$4, lng=$5, accuracy_m=$6, captured_at=$7, received_at=$8, source=$9`,
      [memberId, l.familyId, l.userId, l.lat, l.lng, l.accuracyM, l.capturedAt, l.receivedAt, l.source],
    );
  }
  for (const id of Object.keys(before.locations)) {
    if (!after.locations[id]) await client.query('delete from locations where member_id=$1', [id]);
  }

  // sign-in codes
  for (const [email, c] of Object.entries(after.codes)) {
    if (jsonEq(before.codes[email], c)) continue;
    await client.query(
      `insert into signin_codes (email,hash,created_at,expires_at,attempts) values ($1,$2,$3,$4,$5)
       on conflict (email) do update set hash=$2, created_at=$3, expires_at=$4, attempts=$5`,
      [email, c.hash, c.createdAt, c.expiresAt, c.attempts || 0],
    );
  }
  for (const email of Object.keys(before.codes)) {
    if (!after.codes[email]) await client.query('delete from signin_codes where email=$1', [email]);
  }
}

function jsonEq(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

const FORBIDDEN_AUDIT_KEYS = /^(lat|lng|latitude|longitude|coord|coords|accuracy|token|tokenHash|secret|code|password|authorization|cookie)$/i;
const SECRET_LOOKING = /\b[0-9a-f]{32,}\b|\b[A-Za-z0-9_-]{32,}\b|^-?\d{1,3}\.\d{4,}$/;

export function sanitiseAuditFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (FORBIDDEN_AUDIT_KEYS.test(k)) continue;
    if (typeof v === 'string' && SECRET_LOOKING.test(v)) continue;
    if (v !== null && typeof v === 'object') continue;
    out[k] = v;
  }
  return out;
}

export { TABLES };
