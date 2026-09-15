import type { Genre } from './genres.js';

/**
 * The slice of a creator the domain rules actually depend on.
 *
 * Deliberately narrower than the database row: `packages/core` should not know
 * about handles, avatars or timestamps, so that adding a profile field never
 * forces a change to the matching rules.
 */
export interface CreatorProfile {
  id: string;
  genre: Genre;
  followerCount: number;
  /** Fraction, not a percentage. 0.042 means 4.2%. */
  engagementRate: number;
}

/** The slice of a campaign the domain rules depend on. */
export interface CampaignRequirements {
  id: string;
  targetGenre: Genre;
  /** When true, a genre mismatch is a hard gate rather than a scoring penalty. */
  strictGenre: boolean;
  minFollowers: number;
  /** The engagement rate the brand considers par. Used as the scoring benchmark. */
  minEngagementRate: number;
  budgetCents: number;
  maxWinners: number;
  biddingDeadline: Date;
}

export type FitComponentKey = 'genre' | 'engagement' | 'reach';

/**
 * One line of the "why this score" breakdown.
 *
 * Every score shown in the UI ships with its components, because a bare number
 * tells a creator nothing about what to do differently.
 */
export interface FitComponent {
  key: FitComponentKey;
  label: string;
  points: number;
  maxPoints: number;
  explanation: string;
}

export interface FitScore {
  /** 0-100. Always exactly the sum of `components[].points`. */
  score: number;
  components: FitComponent[];
}

export type IneligibilityCode = 'below_min_followers' | 'genre_restricted';

export interface Ineligibility {
  code: IneligibilityCode;
  /** Creator-facing, specific, and actionable. Never a bare "not eligible". */
  message: string;
}

/**
 * The result of evaluating one campaign for one creator.
 *
 * Note that `fit` is present even when the creator is ineligible: showing a
 * locked campaign alongside "you'd score 82 here once you pass 50k followers"
 * turns a dead end into a reason to come back.
 */
export interface MatchResult {
  campaignId: string;
  eligible: boolean;
  ineligibility: Ineligibility | null;
  fit: FitScore;
}
