import type { Db } from '@marketplace/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { placeBid, previewBid } from '../services/bidding.js';
import { getCampaignForCreator } from '../services/matching.js';
import { parse } from '../validation.js';

const CampaignParams = z.object({ id: z.uuid() });

const DetailQuery = z.object({ creatorId: z.uuid() });

/** Cents, so no fractional money can enter the system through the API. */
const amountCents = z
  .number()
  .int('Bid must be a whole number of cents')
  .positive('Bid must be greater than zero');

const PreviewBody = z.object({ creatorId: z.uuid(), amountCents });

const PlaceBidBody = z.object({
  creatorId: z.uuid(),
  amountCents,
  message: z.string().max(500).optional(),
});

export function registerCampaignRoutes(app: FastifyInstance, db: Db): void {
  app.get('/api/campaigns/:id', async (request) => {
    const { id } = parse(CampaignParams, request.params);
    const { creatorId } = parse(DetailQuery, request.query);
    return getCampaignForCreator(db, id, creatorId);
  });

  /**
   * "What happens if I bid this?" - answered with the real selection algorithm
   * against the bids that exist right now, not an estimate.
   */
  app.post('/api/campaigns/:id/bid-preview', async (request) => {
    const { id } = parse(CampaignParams, request.params);
    const body = parse(PreviewBody, request.body);
    return previewBid(db, {
      campaignId: id,
      creatorId: body.creatorId,
      amountCents: body.amountCents,
    });
  });

  app.post('/api/campaigns/:id/bids', async (request, reply) => {
    const { id } = parse(CampaignParams, request.params);
    const body = parse(PlaceBidBody, request.body);

    const bid = await placeBid(db, {
      campaignId: id,
      creatorId: body.creatorId,
      amountCents: body.amountCents,
      message: body.message,
    });

    // 200 rather than 201: one bid per creator per campaign, so this is an
    // upsert and a creator revising their price has not created anything.
    return reply.status(200).send({ bid });
  });
}
