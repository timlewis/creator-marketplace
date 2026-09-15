import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createDb, createPool } from './client.js';
import { requireDatabaseUrl } from './env.js';

/**
 * Applies pending migrations, then exits.
 *
 * Run as an explicit step (a Kubernetes Job or an `exec` before rollout) rather
 * than on API boot: migrating from every starting replica means N concurrent
 * migrators racing during a rollout.
 */
async function main(): Promise<void> {
  const pool = createPool(requireDatabaseUrl());
  const db = createDb(pool);

  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

  console.log(`Applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('Migrations up to date');

  await pool.end();
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
