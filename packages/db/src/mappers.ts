import type { CampaignRequirements, CreatorProfile } from '@marketplace/core';
import type { CampaignRow, CreatorRow } from './schema.js';

/**
 * Translation between database rows and the domain package's inputs.
 *
 * `packages/core` deliberately knows nothing about the storage layer, so this
 * is the one place that understands both. Keeping the conversion here means the
 * basis-point storage decision below is invisible to the rules that use it.
 */

/** Basis points to a fraction: 420 -> 0.042. */
export function bpsToRate(bps: number): number {
  return bps / 10_000;
}

/** A fraction to basis points: 0.042 -> 420. */
export function rateToBps(rate: number): number {
  return Math.round(rate * 10_000);
}

export function toCreatorProfile(row: CreatorRow): CreatorProfile {
  return {
    id: row.id,
    genre: row.genre,
    followerCount: row.followerCount,
    engagementRate: bpsToRate(row.engagementBps),
  };
}

/**
 * A campaign's domain requirements with the originating row attached.
 *
 * `rankMatches` is generic over anything that satisfies `CampaignRequirements`,
 * so carrying the row through the ranking avoids re-joining on id afterwards
 * just to render a title.
 */
export interface CampaignView extends CampaignRequirements {
  row: CampaignRow;
}

export function toCampaignView(row: CampaignRow): CampaignView {
  return {
    id: row.id,
    targetGenre: row.targetGenre,
    strictGenre: row.strictGenre,
    minFollowers: row.minFollowers,
    minEngagementRate: bpsToRate(row.minEngagementBps),
    budgetCents: row.budgetCents,
    maxWinners: row.maxWinners,
    biddingDeadline: row.biddingDeadline,
    row,
  };
}
