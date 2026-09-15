import { createDb, createPool } from '@marketplace/db';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { testDatabaseUrl } from './helpers.js';

/**
 * Brings the test database up to the current schema once per run.
 *
 * These are integration tests against a real Postgres rather than a mocked
 * client, because every guarantee under test here - row locks, SKIP LOCKED,
 * primary key conflicts, transaction rollback - is a property of the database
 * and would be assumed away by a fake.
 */
export default async function setup(): Promise<void> {
  const pool = createPool(testDatabaseUrl());
  const require = createRequire(import.meta.url);
  const migrationsFolder = resolve(dirname(require.resolve('@marketplace/db')), '../drizzle');

  try {
    await migrate(createDb(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
