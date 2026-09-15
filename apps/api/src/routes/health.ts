import type { Db } from '@marketplace/db';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

export interface MetaOptions {
  devRoutesEnabled: boolean;
}

export function registerHealthRoutes(app: FastifyInstance, db: Db, meta: MetaOptions): void {
  // Lets the frontend show the demo controls only where they actually exist,
  // rather than rendering a button that 404s in production.
  app.get('/api/meta', async () => ({ devRoutesEnabled: meta.devRoutesEnabled }));

  // Liveness: is the process able to serve at all. Deliberately does not touch
  // the database, or a database blip would get the pod restarted rather than
  // taken out of rotation.
  app.get('/healthz', async () => ({ status: 'ok' }));

  // Readiness: should this instance receive traffic right now.
  app.get('/readyz', async (_request, reply) => {
    try {
      await db.execute(sql`SELECT 1`);
      return { status: 'ready' };
    } catch (error: unknown) {
      return reply.status(503).send({ status: 'degraded', error: String(error) });
    }
  });
}
