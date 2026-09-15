import cors from '@fastify/cors';
import type { Db } from '@marketplace/db';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { AppError, toErrorBody } from './errors.js';
import { registerCampaignRoutes } from './routes/campaigns.js';
import { registerCreatorRoutes } from './routes/creators.js';
import { registerDevRoutes } from './routes/dev.js';
import { registerHealthRoutes } from './routes/health.js';

/**
 * Builds the application without starting it, so tests can drive it through
 * `app.inject()` against a real database but no real socket.
 */
export async function buildApp(db: Db, config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    // Trust the proxy for client IPs when running behind an ingress.
    trustProxy: true,
  });

  await app.register(cors, { origin: config.corsOrigin });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      // Expected outcomes - a closed campaign, an ineligible creator - are not
      // faults. Logging them at error level would bury the ones that are.
      request.log.info({ code: error.code, path: request.url }, error.message);
      return reply.status(error.statusCode).send(toErrorBody(error));
    }

    request.log.error({ err: error, path: request.url }, 'Unhandled error');
    return reply
      .status(500)
      .send(toErrorBody(new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our end.')));
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send(toErrorBody(new AppError(404, 'NOT_FOUND', `No route for ${request.url}`))),
  );

  registerHealthRoutes(app, db, { devRoutesEnabled: config.ENABLE_DEV_ROUTES });
  registerCreatorRoutes(app, db);
  registerCampaignRoutes(app, db);

  if (config.ENABLE_DEV_ROUTES) {
    registerDevRoutes(app, db);
    app.log.warn('Dev routes are enabled. Do not run this way in production.');
  }

  return app;
}
