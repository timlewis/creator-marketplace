import { campaigns, seed } from '@marketplace/db';
import type { Db } from '@marketplace/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../errors.js';
import { toCampaignDto } from '../serializers.js';
import { parse } from '../validation.js';

const CampaignParams = z.object({ id: z.uuid() });

/**
 * Demo affordances, gated behind ENABLE_DEV_ROUTES and off by default.
 *
 * The end-to-end loop is meant to run on real elapsed time, and the seeded
 * campaigns are minutes from closing so that it does. But a reviewer should not
 * have to wait to see the interesting part, and "go and edit the database" is
 * exactly the manual step the exercise rules out. Pulling a deadline forward
 * through the API keeps the closing job the only thing that ever closes an
 * auction - this just makes it due sooner.
 */
export function registerDevRoutes(app: FastifyInstance, db: Db): void {
  app.post('/api/dev/campaigns/:id/expire', async (request) => {
    const { id } = parse(CampaignParams, request.params);

    // One second in the past, so the very next pass of the worker picks it up.
    const [row] = await db
      .update(campaigns)
      .set({ biddingDeadline: new Date(Date.now() - 1_000) })
      .where(and(eq(campaigns.id, id), eq(campaigns.status, 'open')))
      .returning();

    if (!row) {
      throw badRequest('Campaign not found, or it has already closed');
    }

    return { campaign: toCampaignDto(row) };
  });

  app.post('/api/dev/reseed', async () => {
    await seed(db);
    return { status: 'reseeded' };
  });
}
