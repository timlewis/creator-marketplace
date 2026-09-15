import { createDb, createPool } from '@marketplace/db';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { testDatabaseUrl } from './helpers.js';

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
