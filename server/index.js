import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './lib/config.js';
import { createStore } from './lib/repo.js';
import { HttpError, checkCsrf, errors, securityHeaders, sendJson } from './lib/http.js';
import { RateLimiter } from './lib/security.js';
import { createMailer } from './lib/email.js';
import { installGlobalRedaction, log } from './lib/log.js';
import { buildRouter, makeContext } from './lib/routes.js';

installGlobalRedaction();

const store = await createStore();
const limiter = new RateLimiter();
const mailer = createMailer(config);
const ctx = makeContext(store, limiter, mailer);
const router = buildRouter(ctx);

/* ------------------------------------------------------------------ */
/* Static files                                                        */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/privacy') rel = '/privacy.html';
  if (rel === '/terms') rel = '/terms.html';
  if (rel.startsWith('/join')) rel = '/index.html';

  // Resolve and verify the path stays inside the public directory.
  const target = path.resolve(config.publicDir, '.' + rel);
  if (!target.startsWith(config.publicDir + path.sep) && target !== config.publicDir) {
    return sendJson(res, 403, { error: { code: 'forbidden', message: 'Forbidden.' } });
  }

  let stat;
  try { stat = await fsp.stat(target); } catch { stat = null; }
  if (!stat || !stat.isFile()) {
    // Single-page app: unknown non-API routes render the shell.
    if (!pathname.startsWith('/api/') && !path.extname(pathname)) {
      return serveStatic(req, res, '/index.html');
    }
    return sendJson(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
  }

  const ext = path.extname(target).toLowerCase();
  const body = await fsp.readFile(target);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': body.length,
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=300',
    'x-content-type-options': 'nosniff',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

export const server = http.createServer(async (req, res) => {
  const started = process.hrtime.bigint();
  securityHeaders(res, config.csp);

  let pathname;
  try {
    pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  } catch {
    return sendJson(res, 400, { error: { code: 'bad_url', message: 'Bad request URL.' } });
  }

  res.setHeader('x-request-id', cryptoRandomId());

  try {
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        throw errors.notFound();
      }
      return await serveStatic(req, res, pathname);
    }

    const matched = router.match(req.method, pathname);
    if (!matched) throw errors.notFound('No such endpoint.');
    if (matched.methodNotAllowed) {
      res.setHeader('allow', 'GET, POST, DELETE');
      throw new HttpError(405, 'method_not_allowed', 'Method not allowed.');
    }

    const csrf = checkCsrf(req, ctx.origin(req));
    if (csrf) throw new HttpError(csrf.status, csrf.code, csrf.message);

    await matched.route.handler(req, res, matched.params);
  } catch (err) {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (err instanceof HttpError) {
      const headers = { 'cache-control': 'no-store', ...(err.headers || {}) };
      sendJson(res, err.status, {
        error: { code: err.code, message: err.message, details: err.details || null },
      }, headers);
      return;
    }
    // Anything unexpected is logged server-side and reported opaquely, so stack
    // traces and internal identifiers never reach the client.
    log.error('unhandled_error', { kind: err && err.name });
    sendJson(res, 500, { error: { code: 'server_error', message: 'Something went wrong.' } });
  } finally {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    if (process.env.LOG_REQUESTS === '1') {
      // Path only: query strings can carry tokens, and we never log bodies.
      log.info('request', { method: req.method, path: pathname, status: res.statusCode, ms: Math.round(ms) });
    }
  }
});

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}

/* Housekeeping: expire locations past retention, prune sessions and rate limits. */
const sweeper = setInterval(() => {
  store.sweep(Date.now(), config).catch((err) => log.warn('sweep_failed', { kind: err && err.name }));
  limiter.sweep();
}, config.sweepIntervalMs);
sweeper.unref();

if (process.env.SAFEPATH_NO_LISTEN !== '1') {
  server.listen(config.port, config.host, () => {
    const banner = [
      '',
      '  SafePath prototype',
      `  listening on http://${config.host}:${config.port}`,
      `  store: ${config.databaseUrl ? 'postgres' : 'json file (' + config.dataDir + ')'}`,
      `  freshness: current <= ${config.currentMaxMs / 1000}s, stale <= ${config.staleMaxMs / 1000}s, retention ${config.locationRetentionMs / 1000}s`,
      `  invitation TTL: ${Math.round(config.inviteTtlMs / 60000)} min`,
      config.devDelivery
        ? '  DEV AUTH ON — sign-in codes are returned to the browser. Isolated demos only.'
        : `  auth delivery: ${config.email.provider}`,
      '',
    ].join('\n');
    console.log(banner);
  });
}

export function closeServer() {
  clearInterval(sweeper);
  return new Promise((resolve) => server.close(resolve));
}

export { store };
