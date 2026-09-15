import { bpsToRate } from '@marketplace/db';
import type { BidRow, CampaignRow, CreatorRow } from '@marketplace/db';
import type { FitComponent } from '@marketplace/core';

/**
 * Wire shapes.
 *
 * Kept explicit rather than returning database rows directly, so that a column
 * rename or an added internal field cannot silently change the public API. It
 * is also where basis points become the rates the UI actually displays.
 */

export interface CreatorDto {
  id: string;
  handle: string;
  displayName: string;
  tagline: string;
  genre: string;
  followerCount: number;
  engagementRate: number;
}

export function toCreatorDto(row: CreatorRow): CreatorDto {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    tagline: row.tagline,
    genre: row.genre,
    followerCount: row.followerCount,
    engagementRate: bpsToRate(row.engagementBps),
  };
}

export interface CampaignDto {
  id: string;
  brandName: string;
  title: string;
  description: string;
  budgetCents: number;
  targetGenre: string;
  strictGenre: boolean;
  minFollowers: number;
  minEngagementRate: number;
  maxWinners: number;
  biddingDeadline: string;
  status: 'open' | 'closed';
  closedAt: string | null;
}

export function toCampaignDto(row: CampaignRow): CampaignDto {
  return {
    id: row.id,
    brandName: row.brandName,
    title: row.title,
    description: row.description,
    budgetCents: row.budgetCents,
    targetGenre: row.targetGenre,
    strictGenre: row.strictGenre,
    minFollowers: row.minFollowers,
    minEngagementRate: bpsToRate(row.minEngagementBps),
    maxWinners: row.maxWinners,
    biddingDeadline: row.biddingDeadline.toISOString(),
    status: row.status,
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

export interface BidDto {
  id: string;
  campaignId: string;
  creatorId: string;
  amountCents: number;
  fitScore: number;
  fitBreakdown: FitComponent[];
  status: 'pending' | 'won' | 'lost';
  lossReason: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toBidDto(row: BidRow): BidDto {
  return {
    id: row.id,
    campaignId: row.campaignId,
    creatorId: row.creatorId,
    amountCents: row.amountCents,
    fitScore: row.fitScore,
    fitBreakdown: row.fitBreakdown,
    status: row.status,
    lossReason: row.lossReason,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
