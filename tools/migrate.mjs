#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATION_FILE = path.join(ROOT, 'server', 'migrations', '001_init.sql');

const connectionString = process.env.DATABASE_URL || process.argv[2];

if (!connectionString) {
  console.error('[migrate] Error: DATABASE_URL environment variable is missing.');
  console.error('Usage: DATABASE_URL="postgres://..." node tools/migrate.mjs');
  process.exit(1);
}

const isSsl = process.env.DATABASE_SSL === 'true' ||
              process.env.DATABASE_SSL === '1' ||
              (!connectionString.includes('localhost') && !connectionString.includes('127.0.0.1'));

const pool = new pg.Pool({
  connectionString,
  ssl: isSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
});

async function run() {
  console.log('[migrate] Connecting to database...');
  const client = await pool.connect();
  try {
    console.log(`[migrate] Reading migration schema from ${path.relative(ROOT, MIGRATION_FILE)}...`);
    const sql = await fs.readFile(MIGRATION_FILE, 'utf8');

    console.log('[migrate] Executing migration script...');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    const { rows } = await client.query(
      `select table_name from information_schema.tables
        where table_schema = 'public'
          and table_name in ('users','sessions','families','members','invites','locations','signin_codes','audit')
        order by table_name`,
    );

    console.log(`[migrate] Success! Verified ${rows.length}/8 required tables:`, rows.map((r) => r.table_name).join(', '));
    if (rows.length < 8) {
      console.warn('[migrate] Warning: Fewer than 8 tables found. Expected 8.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[migrate] Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
