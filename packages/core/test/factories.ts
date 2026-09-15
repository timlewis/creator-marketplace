import type { AuctionBid } from '../src/auction.js';
import type { CampaignRequirements, CreatorProfile } from '../src/types.js';

const EPOCH = new Date('2026-01-01T00:00:00.000Z');

export function creator(overrides: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    id: 'creator-1',
    genre: 'fitness',
    followerCount: 100_000,
    engagementRate: 0.04,
    ...overrides,
  };
}

export function campaign(overrides: Partial<CampaignRequirements> = {}): CampaignRequirements {
  return {
    id: 'campaign-1',
    targetGenre: 'fitness',
    strictGenre: false,
    minFollowers: 50_000,
    minEngagementRate: 0.03,
    budgetCents: 1_000_000,
    maxWinners: 3,
    biddingDeadline: new Date('2026-02-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** `minutesAfterEpoch` keeps `createdAt` explicit wherever ordering is under test. */
export function bid(overrides: Partial<AuctionBid> & { id: string }): AuctionBid {
  return {
    creatorId: `creator-for-${overrides.id}`,
    amountCents: 100_000,
    fitScore: 50,
    createdAt: EPOCH,
    ...overrides,
  };
}

export function minutesAfterEpoch(minutes: number): Date {
  return new Date(EPOCH.getTime() + minutes * 60_000);
}
