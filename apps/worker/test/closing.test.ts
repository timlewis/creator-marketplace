import { bids, campaignClosures, campaigns } from '@marketplace/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDueCampaigns, countOverdueCampaigns } from '../src/closing.js';
import { createTestDb, insertBid, insertCampaign, insertCreator, truncateAll } from './helpers.js';

const harness = createTestDb();
const { db } = harness;

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await harness.close();
});

const bidRows = (campaignId: string) =>
  db.select().from(bids).where(eq(bids.campaignId, campaignId));

const campaignRow = async (campaignId: string) =>
  (await db.select().from(campaigns).where(eq(campaigns.id, campaignId)))[0]!;

describe('closeDueCampaigns', () => {
  it('closes a campaign past its deadline and records every bid outcome', async () => {
    const campaignId = await insertCampaign(db, { budgetCents: 100_000, maxWinners: 2 });
    const winner = await insertBid(db, campaignId, await insertCreator(db), 30_000, 90);
    const loser = await insertBid(db, campaignId, await insertCreator(db), 90_000, 20);

    const report = await closeDueCampaigns(db);

    expect(report.closed).toHaveLength(1);
    expect((await campaignRow(campaignId)).status).toBe('closed');

    const rows = await bidRows(campaignId);
    expect(rows.find((r) => r.id === winner)?.status).toBe('won');
    expect(rows.find((r) => r.id === loser)).toMatchObject({
      status: 'lost',
      lossReason: 'budget_exhausted',
    });
  });

  it('leaves a campaign whose deadline has not passed alone', async () => {
    const campaignId = await insertCampaign(db, { deadlineOffsetMs: 60_000 });
    await insertBid(db, campaignId, await insertCreator(db), 10_000, 50);

    const report = await closeDueCampaigns(db);

    expect(report.scanned).toBe(0);
    expect((await campaignRow(campaignId)).status).toBe('open');
    expect((await bidRows(campaignId))[0]?.status).toBe('pending');
  });

  it('closes a campaign nobody bid on without awarding anything', async () => {
    // The unhappy path a brand actually hits. It must still close, or the
    // campaign sits open forever and shows up as overdue on the dashboard.
    const campaignId = await insertCampaign(db);

    const report = await closeDueCampaigns(db);

    expect(report.closed[0]).toMatchObject({ winnerCount: 0, bidCount: 0, totalAwardedCents: 0 });
    expect((await campaignRow(campaignId)).status).toBe('closed');
  });

  it('never awards more than the budget', async () => {
    const campaignId = await insertCampaign(db, { budgetCents: 100_000, maxWinners: 5 });
    for (const amount of [40_000, 40_000, 40_000, 40_000]) {
      await insertBid(db, campaignId, await insertCreator(db), amount, 80);
    }

    await closeDueCampaigns(db);

    const rows = await bidRows(campaignId);
    const awarded = rows
      .filter((r) => r.status === 'won')
      .reduce((total, r) => total + r.amountCents, 0);

    expect(awarded).toBeLessThanOrEqual(100_000);
    const [closure] = await db
      .select()
      .from(campaignClosures)
      .where(eq(campaignClosures.campaignId, campaignId));
    expect(closure?.totalAwardedCents).toBe(awarded);
  });

  it('records the decision and algorithm version for audit', async () => {
    const campaignId = await insertCampaign(db, { budgetCents: 50_000, maxWinners: 1 });
    await insertBid(db, campaignId, await insertCreator(db), 20_000, 70);

    await closeDueCampaigns(db);

    const [closure] = await db
      .select()
      .from(campaignClosures)
      .where(eq(campaignClosures.campaignId, campaignId));

    expect(closure?.algorithmVersion).toBe('greedy-fit-per-dollar-v1');
    expect(Array.isArray(closure?.decision)).toBe(true);
  });

  it('closes each due campaign independently', async () => {
    const first = await insertCampaign(db, { title: 'First' });
    const second = await insertCampaign(db, { title: 'Second' });

    const report = await closeDueCampaigns(db);

    expect(report.closed.map((c) => c.campaignId).sort()).toEqual([first, second].sort());
  });
});

describe('closeDueCampaigns is safe to run more than once', () => {
  // This is the guarantee the whole design is built around. A scheduled job
  // WILL be run twice: an overlapping CronJob, a retried pod, or an operator
  // running it by hand during an incident.

  it('is a no-op on the second run, and does not re-award', async () => {
    const campaignId = await insertCampaign(db, { budgetCents: 100_000, maxWinners: 1 });
    await insertBid(db, campaignId, await insertCreator(db), 30_000, 90);
    await insertBid(db, campaignId, await insertCreator(db), 40_000, 50);

    const first = await closeDueCampaigns(db);
    const afterFirst = await bidRows(campaignId);

    const second = await closeDueCampaigns(db);
    const afterSecond = await bidRows(campaignId);

    expect(first.closed).toHaveLength(1);
    expect(second.scanned).toBe(0);
    expect(second.closed).toHaveLength(0);

    // Same outcomes, and crucially the same updated_at: nothing was rewritten.
    expect(afterSecond).toEqual(afterFirst);

    const closures = await db
      .select()
      .from(campaignClosures)
      .where(eq(campaignClosures.campaignId, campaignId));
    expect(closures).toHaveLength(1);
  });

  it('closes exactly once when several workers run at the same instant', async () => {
    // The real concurrency case, not a simulated one: four independent
    // connections racing for the same rows, which is what two overlapping
    // CronJob pods look like from the database's point of view.
    const campaignIds = await Promise.all([
      insertCampaign(db, { title: 'A', budgetCents: 100_000, maxWinners: 1 }),
      insertCampaign(db, { title: 'B', budgetCents: 100_000, maxWinners: 1 }),
      insertCampaign(db, { title: 'C', budgetCents: 100_000, maxWinners: 1 }),
    ]);

    for (const campaignId of campaignIds) {
      await insertBid(db, campaignId, await insertCreator(db), 30_000, 90);
      await insertBid(db, campaignId, await insertCreator(db), 50_000, 60);
    }

    const workers = [createTestDb(), createTestDb(), createTestDb(), createTestDb()];
    try {
      const reports = await Promise.all(workers.map((w) => closeDueCampaigns(w.db)));

      // Across every worker, each campaign was closed by exactly one of them.
      const closedIds = reports.flatMap((r) => r.closed.map((c) => c.campaignId));
      expect(closedIds.sort()).toEqual([...campaignIds].sort());
      expect(reports.flatMap((r) => r.failures)).toEqual([]);

      for (const campaignId of campaignIds) {
        const closures = await db
          .select()
          .from(campaignClosures)
          .where(eq(campaignClosures.campaignId, campaignId));
        expect(closures).toHaveLength(1);

        const rows = await bidRows(campaignId);
        expect(rows.filter((r) => r.status === 'won')).toHaveLength(1);
        expect(rows.filter((r) => r.status === 'pending')).toHaveLength(0);

        const awarded = rows
          .filter((r) => r.status === 'won')
          .reduce((total, r) => total + r.amountCents, 0);
        expect(awarded).toBeLessThanOrEqual(100_000);
      }
    } finally {
      await Promise.all(workers.map((w) => w.close()));
    }
  });

  it('skips a campaign another worker is holding, rather than blocking on it', async () => {
    // Proves guard 2 deterministically. The concurrency test above can pass
    // even if the workers happen to serialise; this one holds the row lock open
    // explicitly, so SKIP LOCKED is the only reason the closer can proceed.
    const campaignId = await insertCampaign(db, { budgetCents: 100_000, maxWinners: 1 });
    await insertBid(db, campaignId, await insertCreator(db), 30_000, 90);

    const holder = await harness.pool.connect();
    const other = createTestDb();

    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM campaigns WHERE id = $1 FOR UPDATE', [campaignId]);

      const report = await closeDueCampaigns(other.db);

      expect(report.scanned).toBe(1);
      expect(report.skipped).toBe(1);
      expect(report.closed).toHaveLength(0);
      expect((await campaignRow(campaignId)).status).toBe('open');

      await holder.query('ROLLBACK');

      // Once the lock is released the next pass closes it normally: skipping is
      // a deferral, not a drop.
      const retry = await closeDueCampaigns(other.db);
      expect(retry.closed).toHaveLength(1);
    } finally {
      holder.release();
      await other.close();
    }
  });

  it('refuses to close twice even if the first two guards are bypassed', async () => {
    // Proves guard 3. A closure receipt already exists for this campaign while
    // it is somehow still open - the state a concurrency bug would produce. The
    // primary key must stop the close rather than let a second set of winners
    // be paid, and the whole transaction must roll back with it.
    const campaignId = await insertCampaign(db, { budgetCents: 100_000, maxWinners: 1 });
    const bidId = await insertBid(db, campaignId, await insertCreator(db), 30_000, 90);

    await db.insert(campaignClosures).values({
      campaignId,
      totalAwardedCents: 0,
      winnerCount: 0,
      algorithmVersion: 'planted-by-test',
      decision: [],
    });

    const report = await closeDueCampaigns(db);

    expect(report.closed).toHaveLength(0);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]?.campaignId).toBe(campaignId);

    // Nothing was committed: the bid is untouched and the campaign still open.
    const rows = await bidRows(campaignId);
    expect(rows.find((r) => r.id === bidId)?.status).toBe('pending');
    expect((await campaignRow(campaignId)).status).toBe('open');

    const closures = await db
      .select()
      .from(campaignClosures)
      .where(eq(campaignClosures.campaignId, campaignId));
    expect(closures).toHaveLength(1);
    expect(closures[0]?.algorithmVersion).toBe('planted-by-test');
  });

  it('reaches the same decision whichever worker gets there first', async () => {
    // Determinism is what makes "ran twice" indistinguishable from "ran once".
    const build = async () => {
      const campaignId = await insertCampaign(db, { budgetCents: 90_000, maxWinners: 2 });
      await insertBid(db, campaignId, await insertCreator(db), 30_000, 60);
      await insertBid(db, campaignId, await insertCreator(db), 30_000, 60);
      await insertBid(db, campaignId, await insertCreator(db), 45_000, 90);
      return campaignId;
    };

    const soloId = await build();
    await closeDueCampaigns(db);
    const solo = (
      await db.select().from(campaignClosures).where(eq(campaignClosures.campaignId, soloId))
    )[0]!;

    await truncateAll(db);

    const racedId = await build();
    const workers = [createTestDb(), createTestDb(), createTestDb()];
    try {
      await Promise.all(workers.map((w) => closeDueCampaigns(w.db)));
    } finally {
      await Promise.all(workers.map((w) => w.close()));
    }
    const raced = (
      await db.select().from(campaignClosures).where(eq(campaignClosures.campaignId, racedId))
    )[0]!;

    expect(raced.totalAwardedCents).toBe(solo.totalAwardedCents);
    expect(raced.winnerCount).toBe(solo.winnerCount);
  });
});

describe('countOverdueCampaigns', () => {
  // The alertable signal: a campaign that should have closed and did not.

  it('counts a campaign left open past the grace period', async () => {
    await insertCampaign(db, { deadlineOffsetMs: -600_000 });
    expect(await countOverdueCampaigns(db, { graceMs: 120_000 })).toBe(1);
  });

  it('ignores a campaign only just past its deadline', async () => {
    // Otherwise the gauge alarms on the normal gap between deadline and the
    // next scheduled pass, which is not a fault.
    await insertCampaign(db, { deadlineOffsetMs: -5_000 });
    expect(await countOverdueCampaigns(db, { graceMs: 120_000 })).toBe(0);
  });

  it('returns to zero once the worker has run', async () => {
    await insertCampaign(db, { deadlineOffsetMs: -600_000 });
    await closeDueCampaigns(db);
    expect(await countOverdueCampaigns(db, { graceMs: 120_000 })).toBe(0);
  });
});
