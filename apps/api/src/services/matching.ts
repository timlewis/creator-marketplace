import { rankMatches, suggestBidRange } from '@marketplace/core';
import type { BidGuidance, FitScore, Ineligibility } from '@marketplace/core';
import { bids, campaigns, toCampaignView, toCreatorProfile } from '@marketplace/db';
import type { CampaignRow, CreatorRow, Db, DbExecutor } from '@marketplace/db';
import { and, count, eq, inArray } from 'drizzle-orm';
import { notFound } from '../errors.js';
import { toBidDto, toCampaignDto } from '../serializers.js';
import type { BidDto, CampaignDto } from '../serializers.js';
import { requireCreator } from './creators.js';

export interface MatchDto {
  campaign: CampaignDto;
  fit: FitScore;
  eligible: boolean;
  ineligibility: Ineligibility | null;
  /** False once the deadline has passed but before the worker has closed it. */
  biddingOpen: boolean;
  /** Competing bids currently in play. Count only - other creators' prices are theirs. */
  bidCount: number;
  guidance: BidGuidance;
  myBid: BidDto | null;
}

/**
 * Everything a creator needs to decide where to spend their time, in one call.
 *
 * The matching runs in the application server rather than in SQL. The ranking
 * rules are the product, they change often, and they need to be unit-testable
 * without a database - which is the whole reason `packages/core` exists. If the
 * campaign table ever grows past what is sensible to score in memory, the
 * eligibility gates become a WHERE clause and only the fit scoring stays here.
 */
export async function getMatchesForCreator(db: Db, creatorId: string): Promise<MatchDto[]> {
  const creator = await requireCreator(db, creatorId);

  const openCampaigns = await db.select().from(campaigns).where(eq(campaigns.status, 'open'));
  if (openCampaigns.length === 0) return [];

  const [myBids, counts] = await Promise.all([
    db.select().from(bids).where(eq(bids.creatorId, creatorId)),
    db
      .select({ campaignId: bids.campaignId, total: count() })
      .from(bids)
      .where(
        and(
          inArray(
            bids.campaignId,
            openCampaigns.map((c) => c.id),
          ),
          eq(bids.status, 'pending'),
        ),
      )
      .groupBy(bids.campaignId),
  ]);

  const myBidByCampaign = new Map(myBids.map((bid) => [bid.campaignId, bid]));
  const countByCampaign = new Map(counts.map((row) => [row.campaignId, row.total]));
  const now = new Date();

  return rankMatches(toCreatorProfile(creator), openCampaigns.map(toCampaignView)).map(
    ({ campaign, match }) => {
      const myBid = myBidByCampaign.get(campaign.id) ?? null;
      return {
        campaign: toCampaignDto(campaign.row),
        fit: match.fit,
        eligible: match.eligible,
        ineligibility: match.ineligibility,
        biddingOpen: campaign.biddingDeadline.getTime() > now.getTime(),
        bidCount: countByCampaign.get(campaign.id) ?? 0,
        guidance: suggestBidRange(campaign, match.fit.score),
        myBid: myBid ? toBidDto(myBid) : null,
      };
    },
  );
}

export interface CampaignDetail extends MatchDto {
  creator: CreatorRow;
}

export async function getCampaignForCreator(
  db: Db,
  campaignId: string,
  creatorId: string,
): Promise<CampaignDetail> {
  const creator = await requireCreator(db, creatorId);
  const campaignRow = await requireCampaign(db, campaignId);

  const view = toCampaignView(campaignRow);
  const [match] = rankMatches(toCreatorProfile(creator), [view]);

  const [myBidRows, [countRow]] = await Promise.all([
    db
      .select()
      .from(bids)
      .where(and(eq(bids.campaignId, campaignId), eq(bids.creatorId, creatorId)))
      .limit(1),
    db
      .select({ total: count() })
      .from(bids)
      .where(and(eq(bids.campaignId, campaignId), eq(bids.status, 'pending'))),
  ]);

  const myBid = myBidRows[0] ?? null;

  return {
    creator,
    campaign: toCampaignDto(campaignRow),
    fit: match!.match.fit,
    eligible: match!.match.eligible,
    ineligibility: match!.match.ineligibility,
    biddingOpen:
      campaignRow.status === 'open' && campaignRow.biddingDeadline.getTime() > Date.now(),
    bidCount: countRow?.total ?? 0,
    guidance: suggestBidRange(view, match!.match.fit.score),
    myBid: myBid ? toBidDto(myBid) : null,
  };
}

export async function requireCampaign(db: DbExecutor, campaignId: string): Promise<CampaignRow> {
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!row) throw notFound('Campaign');
  return row;
}
