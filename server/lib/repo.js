import { config } from './config.js';
import { Store } from './store.js';
import { PgStore } from './store-pg.js';

/**
 * Chooses the persistence backend.
 *
 * DATABASE_URL present -> Postgres (the only option in production).
 * Otherwise            -> the JSON file store, which is single-process only and
 *                         refused in production by config.js.
 */
export async function createStore() {
  if (config.databaseUrl) {
    const store = new PgStore(config.databaseUrl, { ssl: config.databaseSsl });
    await store.init();
    return store;
  }
  if (config.production) {
    throw new Error('Refusing to start in production without DATABASE_URL.');
  }
  return new Store(config.dataDir).init();
}
