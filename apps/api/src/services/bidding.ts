import { scoreMatch, selectWinners } from '@marketplace/core';
import type { AuctionBid, AuctionPlacement, FitComponent } from '@marketplace/core';
import {
  bids,
  campaignClosures,
  campaigns,
  toCampaignView,
  toCreatorProfile,
} from '@marketplace/db';
import type { CampaignRow, CreatorRow, Db } from '@marketplace/db';
import { and, desc, eq, ne } from 'drizzle-orm';
import { badRequest, biddingClosed, ineligible } from '../errors.js';
import { toBidDto, toCampaignDto } from '../serializers.js';
import type { BidDto, CampaignDto } from '../serializers.js';
import { requireCampaign } from './matching.js';
import { requireCreator } from './creators.js';

/** Sentinel id for the not-yet-placed bid in a preview. Never written. */
const PREVIEW_BID_ID = '__preview__';

interface FitSnapshot {
  score: number;
  components: FitComponent[];
}

/**
 * Score a creator against a campaign, refusing if they are not allowed to bid.
 *
 * Shared by preview and placement so the number a creator is shown before they
 * commit is by construction the number that gets stored on their bid.
 */
function requireEligibleFit(creator: CreatorRow, campaign: CampaignRow): FitSnapshot {
  const match = scoreMatch(toCreatorProfile(creator), toCampaignView(campaign));

  if (!match.eligible) {
    throw ineligible(
      match.ineligibility?.message ?? 'You are not eligible for this campaign',
      match.ineligibility?.code === 'genre_restricted' ? 'GENRE_RESTRICTED' : 'BELOW_MIN_FOLLOWERS',
    );
  }

  return { score: match.fit.score, components: match.fit.components };
}

function assertBiddingOpen(campaign: CampaignRow, now: Date): void {
  if (campaign.status !== 'open') {
    throw biddingClosed('This campaign has already closed. Winners have been selected.');
  }
  if (campaign.biddingDeadline.getTime() <= now.getTime()) {
    throw biddingClosed('The deadline for this campaign has passed.');
  }
}

export interface PlaceBidInput {
  campaignId: string;
  creatorId: string;
  amountCents: number;
  message?: string | undefined;
}

/**
 * Place or update a creator's bid.
 *
 * The deadline is re-checked inside a transaction holding a share lock on the
 * campaign row, not just at the top of the handler. Without that lock there is
 * a window where the closing job locks the campaign, reads the pending bids,
 * and commits winners while a bid that passed an earlier check is still on its
 * way to the INSERT - producing a bid that is permanently 'pending' on a closed
 * campaign. A share lock is the right strength here: any number of creators may
 * bid at once, but nobody may close underneath them.
 */
export async function placeBid(db: Db, input: PlaceBidInput): Promise<BidDto> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, input.campaignId))
      .for('share')
      .limit(1);

    if (!campaign) throw badRequest('Campaign not found');

    assertBiddingOpen(campaign, now);

    const creator = await requireCreator(tx, input.creatorId);
    const fit = requireEligibleFit(creator, campaign);

    // A bid above the whole budget can never be funded, whatever anyone else
    // does. Taking it would be taking a fee-free guaranteed loss.
    if (input.amountCents > campaign.budgetCents) {
      throw ineligible(
        `Your bid is more than this campaign's entire budget of $${Math.round(
          campaign.budgetCents / 100,
        ).toLocaleString('en-US')}.`,
        'BID_EXCEEDS_BUDGET',
      );
    }

    const [row] = await tx
      .insert(bids)
      .values({
        campaignId: input.campaignId,
        creatorId: input.creatorId,
        amountCents: input.amountCents,
        fitScore: fit.score,
        fitBreakdown: fit.components,
        message: input.message ?? null,
      })
      .onConflictDoUpdate({
        target: [bids.campaignId, bids.creatorId],
        set: {
          amountCents: input.amountCents,
          fitScore: fit.score,
          fitBreakdown: fit.components,
          message: input.message ?? null,
          status: 'pending',
          lossReason: null,
          updatedAt: now,
        },
      })
      .returning();

    return toBidDto(row!);
  });
}

export interface BidPreview {
  amountCents: number;
  fitScore: number;
  wouldWin: boolean;
  rank: number | null;
  /** Bids in the ranking, including this hypothetical one. */
  fieldSize: number;
  lossReason: string | null;
  fitPerDollar: number;
  /** The value per dollar of the weakest projected winner: the bar to clear. */
  clearingFitPerDollar: number | null;
  projectedWinnerCount: number;
  budgetCents: number;
  maxWinners: number;
}

/**
 * Answer "what happens if I bid this?" using the real selection algorithm.
 *
 * This runs the same `selectWinners` the closing job runs, against the bids
 * that actually exist right now. Nothing here is modelled or estimated, which
 * is why the UI can state the result plainly instead of hedging - the only
 * caveat it needs is that other creators may still bid, which is true and
 * shown.
 */
export async function previewBid(
  db: Db,
  input: { campaignId: string; creatorId: string; amountCents: number },
): Promise<BidPreview> {
  const campaign = await requireCampaign(db, input.campaignId);
  const creator = await requireCreator(db, input.creatorId);
  const fit = requireEligibleFit(creator, campaign);

  // Everyone else's live bids. The creator's own is excluded because this
  // amount would replace it, not compete with it.
  const others = await db
    .select()
    .from(bids)
    .where(
      and(
        eq(bids.campaignId, input.campaignId),
        eq(bids.status, 'pending'),
        ne(bids.creatorId, input.creatorId),
      ),
    );

  const [existing] = await db
    .select({ createdAt: bids.createdAt })
    .from(bids)
    .where(and(eq(bids.campaignId, input.campaignId), eq(bids.creatorId, input.creatorId)))
    .limit(1);

  const hypothetical: AuctionBid = {
    id: PREVIEW_BID_ID,
    creatorId: input.creatorId,
    amountCents: input.amountCents,
    fitScore: fit.score,
    // Editing an existing bid keeps its original timestamp, so revising a price
    // does not quietly cost the creator their place in a tie-break.
    createdAt: existing?.createdAt ?? new Date(),
  };

  const outcome = selectWinners({
    budgetCents: campaign.budgetCents,
    maxWinners: campaign.maxWinners,
    bids: [
      ...others.map((row): AuctionBid => ({
        id: row.id,
        creatorId: row.creatorId,
        amountCents: row.amountCents,
        fitScore: row.fitScore,
        createdAt: row.createdAt,
      })),
      hypothetical,
    ],
  });

  const mine = outcome.placements.find((p) => p.bidId === PREVIEW_BID_ID)!;

  return {
    amountCents: input.amountCents,
    fitScore: fit.score,
    wouldWin: mine.outcome === 'won',
    rank: mine.rank,
    fieldSize: outcome.placements.filter((p) => p.rank !== null).length,
    lossReason: mine.lossReason,
    fitPerDollar: mine.fitPerDollar,
    clearingFitPerDollar: outcome.clearingFitPerDollar,
    projectedWinnerCount: outcome.winnerBidIds.length,
    budgetCents: campaign.budgetCents,
    maxWinners: campaign.maxWinners,
  };
}

export interface BidOutcomeDetail {
  rank: number | null;
  fitPerDollar: number;
  clearingFitPerDollar: number | null;
  totalAwardedCents: number;
  winnerCount: number;
  closedAt: string;
}

export interface BidWithContext {
  bid: BidDto;
  campaign: CampaignDto;
  /** Present once the campaign has closed: why this bid landed where it did. */
  outcome: BidOutcomeDetail | null;
}

/**
 * A creator's bids, newest first, with the reasoning attached once decided.
 *
 * The closure's stored decision is replayed here rather than recomputed, so
 * what a creator is told about a past auction cannot drift when the selection
 * rule changes.
 */
export async function listBidsForCreator(db: Db, creatorId: string): Promise<BidWithContext[]> {
  await requireCreator(db, creatorId);

  const rows = await db
    .select({ bid: bids, campaign: campaigns, closure: campaignClosures })
    .from(bids)
    .innerJoin(campaigns, eq(campaigns.id, bids.campaignId))
    .leftJoin(campaignClosures, eq(campaignClosures.campaignId, bids.campaignId))
    .where(eq(bids.creatorId, creatorId))
    .orderBy(desc(bids.updatedAt));

  return rows.map(({ bid, campaign, closure }) => {
    let outcome: BidOutcomeDetail | null = null;

    if (closure) {
      const placements = closure.decision as AuctionPlacement[];
      const mine = placements.find((p) => p.bidId === bid.id);
      const winners = placements.filter((p) => p.outcome === 'won');

      outcome = {
        rank: mine?.rank ?? null,
        fitPerDollar: mine?.fitPerDollar ?? 0,
        clearingFitPerDollar:
          winners.length > 0 ? Math.min(...winners.map((w) => w.fitPerDollar)) : null,
        totalAwardedCents: closure.totalAwardedCents,
        winnerCount: closure.winnerCount,
        closedAt: closure.closedAt.toISOString(),
      };
    }

    return { bid: toBidDto(bid), campaign: toCampaignDto(campaign), outcome };
  });
}
