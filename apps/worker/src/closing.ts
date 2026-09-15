import { ALGORITHM_VERSION, selectWinners } from '@marketplace/core';
import type { AuctionBid, AuctionOutcome, LossReason } from '@marketplace/core';
import { bids, campaignClosures, campaigns } from '@marketplace/db';
import type { Db } from '@marketplace/db';
import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

/**
 * Closing an auction is the only place in this system where money is committed,
 * and it runs unattended on a schedule. It is therefore built on the assumption
 * that it WILL be run twice concurrently at some point - by an overlapping
 * CronJob, a retried pod, or an operator running it by hand during an incident.
 *
 * Three independent guards make that safe, in order of which fires first:
 *
 *  1. The `status = 'open'` predicate inside the locked read. A second run sees
 *     the campaign is already closed and does nothing.
 *  2. `FOR UPDATE SKIP LOCKED` on the campaign row. Two runs in flight at the
 *     same instant cannot both hold the row; the loser skips the campaign
 *     rather than queueing behind it, so concurrent workers partition the work.
 *  3. The primary key on `campaign_closures.campaign_id`. If a bug ever let two
 *     closes past the first two guards, the second INSERT violates the key and
 *     the whole transaction rolls back. A crash is the correct outcome here:
 *     paying two sets of winners is far worse than failing the close.
 *
 * Correctness does not depend on the scheduler. The Kubernetes CronJob sets
 * `concurrencyPolicy: Forbid` as well, but that is a convenience, not the
 * mechanism - it would not protect us against a manual run during an incident.
 */

export type CampaignCloseOutcome = 'closed' | 'skipped';

export interface ClosedCampaignSummary {
  campaignId: string;
  title: string;
  winnerCount: number;
  bidCount: number;
  totalAwardedCents: number;
  budgetCents: number;
}

export interface CloseReport {
  /** Campaigns found past their deadline and still open. */
  scanned: number;
  closed: ClosedCampaignSummary[];
  /** Claimed by another worker, or closed between the scan and the lock. */
  skipped: number;
  failures: Array<{ campaignId: string; error: string }>;
  durationMs: number;
}

export interface CloseOptions {
  /**
   * Treated as "now". Injected so tests can close a deadline without sleeping,
   * and so every write in a single run shares one timestamp.
   */
  now?: Date;
  /** Caps work per run so one invocation cannot monopolise a database. */
  batchSize?: number;
}

const DEFAULT_BATCH_SIZE = 100;

function toAuctionBid(row: typeof bids.$inferSelect): AuctionBid {
  return {
    id: row.id,
    creatorId: row.creatorId,
    amountCents: row.amountCents,
    // Snapshotted at bid time, deliberately not recomputed here. See schema.ts.
    fitScore: row.fitScore,
    createdAt: row.createdAt,
  };
}

/**
 * Close one campaign, or determine that it is not ours to close.
 *
 * Runs in its own transaction rather than sharing one across the batch: a
 * campaign with corrupt data should fail alone, not abort the close of every
 * other campaign that happened to be due at the same minute.
 */
async function closeOneCampaign(
  db: Db,
  campaignId: string,
  now: Date,
): Promise<{ outcome: CampaignCloseOutcome; summary?: ClosedCampaignSummary }> {
  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.status, 'open'),
          lte(campaigns.biddingDeadline, now),
        ),
      )
      .for('update', { skipLocked: true })
      .limit(1);

    // Guards 1 and 2 both surface here as "no row": either another worker holds
    // the lock, or the campaign was closed since we scanned for it.
    if (!campaign) {
      return { outcome: 'skipped' as const };
    }

    const pending = await tx
      .select()
      .from(bids)
      .where(and(eq(bids.campaignId, campaignId), eq(bids.status, 'pending')))
      // Ordering is not required for a correct decision - selectWinners is
      // order-independent by construction - but a stable read makes the
      // decision JSON diffable between runs when debugging.
      .orderBy(asc(bids.id));

    const outcome: AuctionOutcome = selectWinners({
      budgetCents: campaign.budgetCents,
      maxWinners: campaign.maxWinners,
      bids: pending.map(toAuctionBid),
    });

    await applyOutcome(tx, campaignId, outcome, now);

    await tx.insert(campaignClosures).values({
      campaignId,
      closedAt: now,
      totalAwardedCents: outcome.totalAwardedCents,
      winnerCount: outcome.winnerBidIds.length,
      algorithmVersion: outcome.algorithmVersion,
      decision: outcome.placements,
    });

    await tx
      .update(campaigns)
      .set({ status: 'closed', closedAt: now })
      .where(eq(campaigns.id, campaignId));

    return {
      outcome: 'closed' as const,
      summary: {
        campaignId,
        title: campaign.title,
        winnerCount: outcome.winnerBidIds.length,
        bidCount: pending.length,
        totalAwardedCents: outcome.totalAwardedCents,
        budgetCents: campaign.budgetCents,
      },
    };
  });
}

/** Write the decision onto the bids, grouped so this is a fixed number of statements. */
async function applyOutcome(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  campaignId: string,
  outcome: AuctionOutcome,
  now: Date,
): Promise<void> {
  if (outcome.winnerBidIds.length > 0) {
    await tx
      .update(bids)
      .set({ status: 'won', lossReason: null, updatedAt: now })
      .where(and(eq(bids.campaignId, campaignId), inArray(bids.id, outcome.winnerBidIds)));
  }

  const losersByReason = new Map<LossReason, string[]>();
  for (const placement of outcome.placements) {
    if (placement.outcome !== 'lost' || placement.lossReason === null) continue;
    const bucket = losersByReason.get(placement.lossReason) ?? [];
    bucket.push(placement.bidId);
    losersByReason.set(placement.lossReason, bucket);
  }

  for (const [reason, bidIds] of losersByReason) {
    await tx
      .update(bids)
      .set({ status: 'lost', lossReason: reason, updatedAt: now })
      .where(and(eq(bids.campaignId, campaignId), inArray(bids.id, bidIds)));
  }
}

/**
 * Find every campaign whose deadline has passed and close it.
 *
 * The candidate scan runs outside a transaction on purpose: holding locks while
 * deciding which rows to lock would serialise workers against each other for no
 * benefit. The scan is advisory - every campaign it names is re-checked under a
 * lock before anything is written.
 */
export async function closeDueCampaigns(db: Db, options: CloseOptions = {}): Promise<CloseReport> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const startedAt = Date.now();

  const due = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.status, 'open'), lte(campaigns.biddingDeadline, now)))
    .orderBy(asc(campaigns.biddingDeadline))
    .limit(batchSize);

  const report: CloseReport = {
    scanned: due.length,
    closed: [],
    skipped: 0,
    failures: [],
    durationMs: 0,
  };

  for (const { id } of due) {
    try {
      const result = await closeOneCampaign(db, id, now);
      if (result.outcome === 'closed' && result.summary) {
        report.closed.push(result.summary);
      } else {
        report.skipped += 1;
      }
    } catch (error: unknown) {
      // One campaign failing must not stop the rest. The failure is reported so
      // the caller can log it and so an operator can see it in the run summary.
      report.failures.push({
        campaignId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  report.durationMs = Date.now() - startedAt;
  return report;
}

/**
 * Campaigns that are past their deadline and still open beyond a grace period.
 *
 * This is the number worth paging on. A closing job that is failing silently
 * looks identical to one that has nothing to do, so "nothing closed recently"
 * is not an alert - "something should have closed and did not" is.
 */
export async function countOverdueCampaigns(
  db: Db,
  options: { now?: Date; graceMs?: number } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const graceMs = options.graceMs ?? 120_000;
  const threshold = new Date(now.getTime() - graceMs);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.status, 'open'),
        lte(campaigns.biddingDeadline, threshold),
        isNull(campaigns.closedAt),
      ),
    );

  return row?.count ?? 0;
}
