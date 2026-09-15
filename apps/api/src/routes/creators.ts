import type { Db } from '@marketplace/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { toCreatorDto } from '../serializers.js';
import { listBidsForCreator } from '../services/bidding.js';
import { listCreators } from '../services/creators.js';
import { getMatchesForCreator } from '../services/matching.js';
import { parse } from '../validation.js';

const CreatorParams = z.object({ id: z.uuid() });

export function registerCreatorRoutes(app: FastifyInstance, db: Db): void {
  // The "act as" picker. No auth by design: the exercise has no accounts, and
  // pretending otherwise would add a login flow nobody asked for.
  app.get('/api/creators', async () => {
    const rows = await listCreators(db);
    return { creators: rows.map(toCreatorDto) };
  });

  app.get('/api/creators/:id/campaigns', async (request) => {
    const { id } = parse(CreatorParams, request.params);
    return { matches: await getMatchesForCreator(db, id) };
  });

  app.get('/api/creators/:id/bids', async (request) => {
    const { id } = parse(CreatorParams, request.params);
    return { bids: await listBidsForCreator(db, id) };
  });
}
