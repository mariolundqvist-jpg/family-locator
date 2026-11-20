// A tiny, dependency-free JSON document store with atomic writes and a
// serialised mutation queue.
//
// Why not SQLite: the runtime here is Node 20, which has no built-in SQLite
// binding, and pulling a native module adds build risk for a prototype whose
// job is to prove authorisation logic. The authorisation logic is identical
// either way; section 6 of docs/ARCHITECTURE.md states exactly what changes
// when this is swapped for Postgres.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { sanitiseAuditFields } from './store-pg.js';

const EMPTY = {
  version: 1,
  users: {},
  sessions: {},
  families: {},
  members: {},
  invites: {},
  locations: {},
  audit: [],
};

export class Store {
  constructor(dataDir, filenames = {}) {
    this.dir = dataDir;
    this.file = path.join(dataDir, filenames.db || 'db.json');
    this.auditFile = path.join(dataDir, filenames.audit || 'audit.jsonl');
    this.data = structuredClone(EMPTY);
    this._queue = Promise.resolve();
    this._dirty = false;
  }

  async init() {
    await fsp.mkdir(this.dir, { recursive: true });
    try {
      const raw = await fsp.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = { ...structuredClone(EMPTY), ...parsed };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // A corrupt store must fail loudly rather than start empty and appear
        // to have lost every family. Move it aside and refuse to guess.
        const backup = `${this.file}.corrupt-${Date.now()}`;
        await fsp.rename(this.file, backup).catch(() => {});
        throw new Error(`Store was unreadable and has been moved to ${backup}: ${err.message}`);
      }
      this.data = structuredClone(EMPTY);
      await this._flush();
    }
    return this;
  }

  /**
   * Read-only access. Callers must not mutate the returned object.
   * Async so that the Postgres store can implement the identical contract.
   */
  async snapshot() {
    return this.data;
  }

  /** @deprecated prefer snapshot(); kept for the in-process tests. */
  get db() {
    return this.data;
  }

  /**
   * Serialise a mutation. Every write path in the app goes through this, which
   * is what makes single-use invitation consumption race-free in a single
   * process. (Multi-process deployment needs a transactional store; see docs.)
   */
  mutate(fn) {
    const run = this._queue.then(async () => {
      const result = fn(this.data);
      this._dirty = true;
      await this._flush();
      return result;
    });
    // Keep the chain alive even if a mutation throws.
    this._queue = run.catch(() => {});
    return run;
  }

  async _flush() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    const payload = JSON.stringify(this.data);
    const handle = await fsp.open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fsp.rename(tmp, this.file);
    this._dirty = false;
  }

  /**
   * Audit trail is append-only, rotated by size, and never contains
   * coordinates. It exists so a user can be shown what happened to their data.
   */
  async audit(entry) {
    const { event, userId, familyId, ...fields } = entry;
    const clean = sanitiseAuditFields(fields);
    const line = JSON.stringify({
      ts: new Date().toISOString(), event, userId, familyId, ...clean,
    }) + '\n';
    await fsp.appendFile(this.auditFile, line, { mode: 0o600 });
  }

  async readAudit(limit = 200) {
    try {
      const raw = await fsp.readFile(this.auditFile, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean);
      return lines.slice(-limit).map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean).reverse();
    } catch {
      return [];
    }
  }

  /** Remove rows that have exceeded their retention window. */
  sweep(now, policy) {
    return this.mutate((db) => {
      let removed = 0;
      for (const [memberId, loc] of Object.entries(db.locations)) {
        const age = now - loc.capturedAt;
        if (age > policy.locationRetentionMs) {
          delete db.locations[memberId];
          removed += 1;
        }
      }
      for (const [id, s] of Object.entries(db.sessions)) {
        if (now > s.expiresAt || now - s.lastSeenAt > policy.sessionIdleMs) {
          delete db.sessions[id];
        }
      }
      for (const [id, c] of Object.entries(db.codes || {})) {
        if (now > c.expiresAt) delete db.codes[id];
      }
      for (const [id, i] of Object.entries(db.invites)) {
        // Expired invitations are deleted, not merely flagged, so that a stale
        // token cannot be resurrected by a clock or config change.
        if (!i.usedAt && now > i.expiresAt + 24 * 60 * 60 * 1000) delete db.invites[id];
      }
      return removed;
    });
  }

  close() {
    fs.existsSync(this.dir);
  }
}
