#!/usr/bin/env node
/**
 * Throwaway API server for the device tests.
 *
 * Starts the real server from ../../server against a temporary data directory
 * on a fixed port, with demo authentication enabled so the fixture script can
 * create its two accounts without a mailbox. Nothing here is production code:
 * it exists so a device test run is hermetic and can be repeated.
 *
 *   node e2e/server.mjs            # port 8790, fresh data dir
 *   PORT=9000 node e2e/server.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(here, '../../server/index.js');

const port = process.env.PORT ?? '8790';
const dataDir = mkdtempSync(join(tmpdir(), 'safepath-e2e-'));

const child = spawn(process.execPath, [serverEntry], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    DATA_DIR: dataDir,
    PORT: port,
    HOST: '0.0.0.0',
    DEV_DELIVERY: '1',
    SAFEPATH_SECRET: 'e2e-only-secret-not-for-any-real-deployment',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const shutdown = (code = 0) => {
  child.kill('SIGTERM');
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(code);
};

child.stdout.on('data', (d) => process.stdout.write(d));
child.stderr.on('data', (d) => process.stderr.write(d));
child.on('exit', (code) => {
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(code ?? 0);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

process.stderr.write(`E2E server: http://0.0.0.0:${port} (data in ${dataDir})\n`);
