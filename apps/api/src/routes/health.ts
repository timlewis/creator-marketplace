import type { Db } from '@marketplace/db';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(app: FastifyInstance, db: Db): void {
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
