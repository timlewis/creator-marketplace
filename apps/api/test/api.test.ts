import type {
  BidDto,
  BidPreview,
  BidWithContext,
  CampaignDto,
  ErrorBody,
  MatchDto,
} from '@marketplace/api';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApiHarness, insertCampaign, insertCreator, truncateAll } from './helpers.js';
import type { ApiHarness } from './helpers.js';

const harness: ApiHarness = await createApiHarness();
const { app, db } = harness;

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await harness.close();
});

/**
 * Read a response body as the shape the server promises.
 *
 * Typed against the DTOs the API exports rather than `any`, so a change to the
 * wire contract breaks these tests at compile time instead of at assertion time.
 */
const json = <T>(response: { body: string }): T => JSON.parse(response.body) as T;

type Matches = { matches: MatchDto[] };
type Bids = { bids: BidWithContext[] };

describe('GET /api/creators/:id/campaigns', () => {
  it('ranks eligible campaigns by fit and keeps ineligible ones visible with a reason', async () => {
    // A creator never sees a raw list: they see what they can act on, ranked,
    // and what they cannot, explained. Hiding the locked ones would leave them
    // wondering why a campaign they heard about is missing.
    const creatorId = await insertCreator(db, { genre: 'fitness', followerCount: 60_000 });
    await insertCampaign(db, { title: 'Perfect', targetGenre: 'fitness' });
    await insertCampaign(db, { title: 'Unrelated', targetGenre: 'finance' });
    await insertCampaign(db, { title: 'Too big', targetGenre: 'fitness', minFollowers: 500_000 });

    const body = json<Matches>(await app.inject({ url: `/api/creators/${creatorId}/campaigns` }));
    const titles = body.matches.map((m) => m.campaign.title);

    expect(titles).toEqual(['Perfect', 'Unrelated', 'Too big']);

    const locked = body.matches.find((m) => m.campaign.title === 'Too big')!;
    expect(locked.eligible).toBe(false);
    expect(locked.ineligibility?.message).toContain('500,000 followers');
    // Still scored, so the card can say what they would be worth here.
    expect(locked.fit.score).toBeGreaterThan(0);
  });

  it('includes the fit breakdown, and it adds up to the headline score', async () => {
    const creatorId = await insertCreator(db);
    await insertCampaign(db);

    const body = json<Matches>(await app.inject({ url: `/api/creators/${creatorId}/campaigns` }));
    const { fit } = body.matches[0]!;
    const summed = fit.components.reduce((total, c) => total + c.points, 0);

    expect(fit.components).toHaveLength(3);
    expect(summed).toBe(fit.score);
  });

  it('404s for a creator that does not exist', async () => {
    const response = await app.inject({
      url: '/api/creators/00000000-0000-4000-8000-000000000000/campaigns',
    });
    expect(response.statusCode).toBe(404);
    expect(json<ErrorBody>(response).error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/campaigns/:id/bids', () => {
  it('places a bid and snapshots the fit it was scored on', async () => {
    const creatorId = await insertCreator(db);
    const campaignId = await insertCampaign(db);

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/bids`,
      payload: { creatorId, amountCents: 250_000, message: 'Happy to do three posts.' },
    });

    expect(response.statusCode).toBe(200);
    expect(json<{ bid: BidDto }>(response).bid).toMatchObject({
      status: 'pending',
      amountCents: 250_000,
    });
    expect(json<{ bid: BidDto }>(response).bid.fitScore).toBeGreaterThan(0);
  });

  it('replaces an existing bid rather than creating a second one', async () => {
    // One offer per creator per campaign. Otherwise a creator who changes their
    // mind ends up competing against themselves.
    const creatorId = await insertCreator(db);
    const campaignId = await insertCampaign(db);
    const place = (amountCents: number) =>
      app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/bids`,
        payload: { creatorId, amountCents },
      });

    const first = json<{ bid: BidDto }>(await place(250_000)).bid;
    const second = json<{ bid: BidDto }>(await place(180_000)).bid;

    expect(second.id).toBe(first.id);
    expect(second.amountCents).toBe(180_000);

    const list = json<Bids>(await app.inject({ url: `/api/creators/${creatorId}/bids` }));
    expect(list.bids).toHaveLength(1);
  });

  it('refuses a bid once the deadline has passed', async () => {
    // The window between the deadline and the worker's next pass is real, and
    // a bid landing in it would sit pending forever.
    const creatorId = await insertCreator(db);
    const campaignId = await insertCampaign(db, { deadlineOffsetMs: -1_000 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/bids`,
      payload: { creatorId, amountCents: 100_000 },
    });

    expect(response.statusCode).toBe(409);
    expect(json<ErrorBody>(response).error.code).toBe('BIDDING_CLOSED');
  });

  it('refuses a bid from a creator below the follower minimum', async () => {
    const creatorId = await insertCreator(db, { followerCount: 1_000 });
    const campaignId = await insertCampaign(db, { minFollowers: 50_000 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/bids`,
      payload: { creatorId, amountCents: 100_000 },
    });

    expect(response.statusCode).toBe(422);
    expect(json<ErrorBody>(response).error.code).toBe('BELOW_MIN_FOLLOWERS');
    expect(json<ErrorBody>(response).error.message).toContain('50,000');
  });

  it('refuses a bid larger than the entire campaign budget', async () => {
    // It could never be funded, so accepting it would be accepting a
    // guaranteed loss without telling the creator.
    const creatorId = await insertCreator(db);
    const campaignId = await insertCampaign(db, { budgetCents: 100_000 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/bids`,
      payload: { creatorId, amountCents: 200_000 },
    });

    expect(response.statusCode).toBe(422);
    expect(json<ErrorBody>(response).error.code).toBe('BID_EXCEEDS_BUDGET');
  });

  it('rejects a malformed bid with the offending field named', async () => {
    const creatorId = await insertCreator(db);
    const campaignId = await insertCampaign(db);

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/bids`,
      payload: { creatorId, amountCents: -5 },
    });

    expect(response.statusCode).toBe(400);
    expect((json<ErrorBody>(response).error.details as Array<{ field: string }>)[0]?.field).toBe(
      'amountCents',
    );
  });
});

describe('POST /api/campaigns/:id/bid-preview', () => {
  it('projects a win or a loss using the real selection rule', async () => {
    const campaignId = await insertCampaign(db, { budgetCents: 100_000, maxWinners: 1 });
    const rival = await insertCreator(db);
    await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/bids`,
      payload: { creatorId: rival, amountCents: 50_000 },
    });

    const creatorId = await insertCreator(db);
    const preview = (amountCents: number) =>
      app
        .inject({
          method: 'POST',
          url: `/api/campaigns/${campaignId}/bid-preview`,
          payload: { creatorId, amountCents },
        })
        .then((r) => json<BidPreview>(r));

    // Same fit as the rival, so undercutting wins and overpaying loses. This is
    // the monotonicity the greedy rule guarantees, visible to the creator.
    expect((await preview(30_000)).wouldWin).toBe(true);
    expect((await preview(90_000)).wouldWin).toBe(false);
  });

  it('does not treat the creators own existing bid as competition', async () => {
    // Previewing a revision must compare against everyone else, not against
    // the bid this one would replace.
    const creatorId = await insertCreator(db);
    const campaignId = await insertCampaign(db, { budgetCents: 100_000, maxWinners: 1 });
    await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/bids`,
      payload: { creatorId, amountCents: 40_000 },
    });

    const preview = json<BidPreview>(
      await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaignId}/bid-preview`,
        payload: { creatorId, amountCents: 60_000 },
      }),
    );

    expect(preview.fieldSize).toBe(1);
    expect(preview.wouldWin).toBe(true);
  });
});

describe('dev routes', () => {
  it('are not mounted unless explicitly enabled', async () => {
    // They pull deadlines forward. A production deploy that forgets to set a
    // flag must not expose them.
    const campaignId = await insertCampaign(db);
    const response = await app.inject({
      method: 'POST',
      url: `/api/dev/campaigns/${campaignId}/expire`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('pull a deadline into the past when enabled', async () => {
    const dev = await createApiHarness({ ENABLE_DEV_ROUTES: true });
    try {
      const campaignId = await insertCampaign(db, { deadlineOffsetMs: 3_600_000 });
      const response = await dev.app.inject({
        method: 'POST',
        url: `/api/dev/campaigns/${campaignId}/expire`,
      });

      expect(response.statusCode).toBe(200);
      const deadline = new Date(json<{ campaign: CampaignDto }>(response).campaign.biddingDeadline);
      expect(deadline.getTime()).toBeLessThan(Date.now());
    } finally {
      await dev.close();
    }
  });
});

describe('health', () => {
  it('reports liveness without touching the database', async () => {
    expect(json<{ status: string }>(await app.inject({ url: '/healthz' }))).toEqual({
      status: 'ok',
    });
  });

  it('reports readiness by checking the database', async () => {
    expect(json<{ status: string }>(await app.inject({ url: '/readyz' }))).toEqual({
      status: 'ready',
    });
  });
});
