/**
 * Boots a throwaway server instance for a test run: temporary data directory,
 * own port, and its own in-memory rate-limit buckets. This keeps test runs
 * reproducible and stops them from consuming the dev preview's limits.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

export async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export async function waitForHealth(origin, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${origin}/api/health`);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server did not become healthy within ${timeoutMs}ms`);
}

const PG_BASE = process.env.TEST_PG_BASE || null;

/** Create a throwaway database and apply the migrations. */
async function provisionDatabase() {
  const { default: pg } = await import('pg');
  const name = `safepath_t_${crypto.randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: PG_BASE });
  await admin.connect();
  try {
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(PG_BASE);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const sql = await fs.readFile(path.join(ROOT, 'server', 'migrations', '001_init.sql'), 'utf8');
    await client.query(sql);
  } finally {
    await client.end();
  }
  return { name, url: url.toString() };
}

async function dropDatabase(name) {
  const { default: pg } = await import('pg');
  const admin = new pg.Client({ connectionString: PG_BASE });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${name} with (force)`);
  } finally {
    await admin.end();
  }
}

/**
 * @param {Record<string,string|number>} envOverrides
 * @param {{backend?: 'json'|'postgres'}} options
 */
export async function startServer(envOverrides = {}, options = {}) {
  const backend = options.backend || (PG_BASE && process.env.TEST_BACKEND === 'postgres' ? 'postgres' : 'json');
  let database = null;
  if (backend === 'postgres') {
    if (!PG_BASE) throw new Error('TEST_PG_BASE is required for the postgres backend');
    database = await provisionDatabase();
  }
  const port = await freePort();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safepath-test-'));
  let output = '';

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      NODE_ENV: 'test',
      ...Object.fromEntries(Object.entries(envOverrides).map(([k, v]) => [k, String(v)])),
      ...(database ? { DATABASE_URL: database.url } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { output += d.toString(); });
  child.stderr.on('data', (d) => { output += d.toString(); });

  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitForHealth(origin);
  } catch (err) {
    child.kill('SIGKILL');
    throw new Error(`${err.message}\nServer output:\n${output}`);
  }

  return {
    origin,
    port,
    dataDir,
    backend,
    databaseUrl: database ? database.url : null,
    env: envOverrides,
    logs: () => output,
    async stop() {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        const t = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
        child.on('exit', () => { clearTimeout(t); resolve(); });
      });
      await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
      if (database) await dropDatabase(database.name).catch(() => {});
    },
  };
}

/**
 * Read the whole state from either backend, in the same shape the application
 * uses internally, so tests assert on identical structures.
 */
export async function readState(srv) {
  if (srv.backend === 'postgres') {
    const { PgStore } = await import('../server/lib/store-pg.js');
    const store = await new PgStore(srv.databaseUrl).init();
    try {
      return await store.snapshot();
    } finally {
      await store.close();
    }
  }
  return JSON.parse(await fs.readFile(path.join(srv.dataDir, 'db.json'), 'utf8'));
}

/** Minimal cookie-aware HTTP client used by the security suite. */
export class Client {
  constructor(origin) {
    this.origin = origin;
    this.cookie = null;
  }

  async request(method, path, body, { headers = {}, omitCsrf = false } = {}) {
    const h = { ...headers };
    if (!omitCsrf && !h['x-safepath-client']) h['x-safepath-client'] = 'web';
    if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
    if (this.cookie) h.cookie = this.cookie;

    const res = await fetch(this.origin + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      redirect: 'manual',
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const first = setCookie.split(',')[0];
      const pair = first.split(';')[0];
      this.cookie = pair.endsWith('=') ? null : pair;
    }

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { status: res.status, headers: res.headers, json, text };
  }

  get(p, o) { return this.request('GET', p, undefined, o); }
  post(p, body, o) { return this.request('POST', p, body, o); }
  del(p, o) { return this.request('DELETE', p, undefined, o); }

  /** Sign in and return the development code that was issued. */
  async signIn(email, name) {
    const codeRes = await this.post('/api/auth/request-code', { email });
    if (codeRes.status !== 200) throw new Error(`request-code failed: ${codeRes.status} ${codeRes.text}`);
    const code = codeRes.json.devCode;
    const verify = await this.post('/api/auth/verify', { email, code, displayName: name });
    if (verify.status !== 200) throw new Error(`verify failed: ${verify.status} ${verify.text}`);
    this.user = verify.json.user;
    return this.user;
  }
}
