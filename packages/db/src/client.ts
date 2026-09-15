import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>;

/** A transaction handle, for functions that must run inside one. */
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Either works for reads; only the transaction handle is safe for a close. */
export type DbExecutor = Db | DbTransaction;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    // Fail fast rather than queueing behind an unhealthy database: a request
    // that hangs for 30s is worse for the caller than one that errors in 5.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

export { schema };
