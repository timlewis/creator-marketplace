import { formatCount, formatMultiple, formatRate } from './format.js';
import { genreLabel, relateGenres } from './genres.js';
import type { CampaignRequirements, CreatorProfile, FitComponent, FitScore, Ineligibility, MatchResult } from './types.js';

/**
 * Point budget per scoring component. Sums to 100.
 *
 * Exported so the UI can render progress bars against the same maxima the
 * scorer uses, instead of hard-coding them a second time.
 */
export const FIT_WEIGHTS = {
  genre: 40,
  engagement: 35,
  reach: 25,
} as const;

/** Engagement at or below half the brand's bar scores zero; at or above double it scores full. */
const ENGAGEMENT_FLOOR_RATIO = 0.5;
const ENGAGEMENT_CEILING_RATIO = 2;

/** Reach is scored on a log scale: 8x the follower minimum earns full marks. */
const REACH_CEILING_MULTIPLE = 8;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function scoreGenre(creator: CreatorProfile, campaign: CampaignRequirements): FitComponent {
  const relation = relateGenres(creator.genre, campaign.targetGenre);
  const fraction = relation === 'exact' ? 1 : relation === 'adjacent' ? 0.6 : 0.2;
  const target = genreLabel(campaign.targetGenre);
  const mine = genreLabel(creator.genre);

  const explanation =
    relation === 'exact'
      ? `Exact match for ${target}`
      : relation === 'adjacent'
        ? `${mine} is adjacent to ${target}`
        : `${mine} sits outside ${target}`;

  return {
    key: 'genre',
    label: 'Genre fit',
    points: Math.round(FIT_WEIGHTS.genre * fraction),
    maxPoints: FIT_WEIGHTS.genre,
    explanation,
  };
}

function scoreEngagement(creator: CreatorProfile, campaign: CampaignRequirements): FitComponent {
  const base = {
    key: 'engagement',
    label: 'Engagement',
    maxPoints: FIT_WEIGHTS.engagement,
  } as const;

  // No bar set means the brand is not selecting on engagement, so nobody is penalised for it.
  if (campaign.minEngagementRate <= 0) {
    return { ...base, points: FIT_WEIGHTS.engagement, explanation: 'No engagement bar set' };
  }

  const ratio = creator.engagementRate / campaign.minEngagementRate;
  const normalized = clamp01(
    (ratio - ENGAGEMENT_FLOOR_RATIO) / (ENGAGEMENT_CEILING_RATIO - ENGAGEMENT_FLOOR_RATIO),
  );

  return {
    ...base,
    points: Math.round(FIT_WEIGHTS.engagement * normalized),
    explanation: `${formatRate(creator.engagementRate)} engagement vs ${formatRate(
      campaign.minEngagementRate,
    )} target (${formatMultiple(ratio)})`,
  };
}

function scoreReach(creator: CreatorProfile, campaign: CampaignRequirements): FitComponent {
  const base = { key: 'reach', label: 'Reach headroom', maxPoints: FIT_WEIGHTS.reach } as const;

  if (campaign.minFollowers <= 0) {
    return { ...base, points: FIT_WEIGHTS.reach, explanation: 'No follower minimum' };
  }

  const ratio = creator.followerCount / campaign.minFollowers;
  const followers = formatCount(creator.followerCount);
  const minimum = formatCount(campaign.minFollowers);

  if (ratio <= 1) {
    return {
      ...base,
      points: 0,
      explanation: `${followers} followers against a ${minimum} minimum`,
    };
  }

  // Log scale so a 40x creator does not bury a solid 3x one: the brand already
  // got what it asked for, and extra reach has diminishing value past a point.
  const normalized = clamp01(Math.log2(ratio) / Math.log2(REACH_CEILING_MULTIPLE));

  return {
    ...base,
    points: Math.round(FIT_WEIGHTS.reach * normalized),
    explanation: `${followers} followers, ${formatMultiple(ratio)} the ${minimum} minimum`,
  };
}

/**
 * Hard gates. A campaign failing one of these is still shown to the creator,
 * greyed out with the reason, rather than silently filtered away.
 *
 * Only the first failing gate is reported: listing every way a creator falls
 * short is discouraging and rarely more actionable than naming the nearest one.
 */
function checkEligibility(
  creator: CreatorProfile,
  campaign: CampaignRequirements,
): Ineligibility | null {
  if (creator.followerCount < campaign.minFollowers) {
    return {
      code: 'below_min_followers',
      message: `Needs ${formatCount(campaign.minFollowers)} followers - you have ${formatCount(
        creator.followerCount,
      )}`,
    };
  }

  if (campaign.strictGenre && relateGenres(creator.genre, campaign.targetGenre) !== 'exact') {
    return {
      code: 'genre_restricted',
      message: `Open to ${genreLabel(campaign.targetGenre)} creators only`,
    };
  }

  return null;
}

/**
 * Score one campaign for one creator.
 *
 * The total is the sum of the rounded components rather than a separately
 * rounded total, so the breakdown shown in the UI always adds up to the headline
 * number. A score whose parts visibly do not sum reads as broken.
 */
export function scoreMatch(creator: CreatorProfile, campaign: CampaignRequirements): MatchResult {
  const components = [
    scoreGenre(creator, campaign),
    scoreEngagement(creator, campaign),
    scoreReach(creator, campaign),
  ];

  const fit: FitScore = {
    score: components.reduce((sum, component) => sum + component.points, 0),
    components,
  };

  const ineligibility = checkEligibility(creator, campaign);

  return {
    campaignId: campaign.id,
    eligible: ineligibility === null,
    ineligibility,
    fit,
  };
}

export interface RankedMatch<T extends CampaignRequirements> {
  campaign: T;
  match: MatchResult;
}

/**
 * Score and order every campaign for a creator.
 *
 * Generic in the campaign type so callers can pass full database rows and get
 * them back untouched, rather than re-joining on id afterwards.
 *
 * Ordering: eligible first, then best fit, then soonest deadline (a great match
 * closing in ten minutes deserves attention before an equally good one closing
 * next week), then largest budget. Ties break on id so the list is stable.
 */
export function rankMatches<T extends CampaignRequirements>(
  creator: CreatorProfile,
  campaigns: readonly T[],
): Array<RankedMatch<T>> {
  return campaigns
    .map((campaign) => ({ campaign, match: scoreMatch(creator, campaign) }))
    .sort((a, b) => {
      if (a.match.eligible !== b.match.eligible) return a.match.eligible ? -1 : 1;
      if (a.match.fit.score !== b.match.fit.score) return b.match.fit.score - a.match.fit.score;

      const deadlineDelta =
        a.campaign.biddingDeadline.getTime() - b.campaign.biddingDeadline.getTime();
      if (deadlineDelta !== 0) return deadlineDelta;

      if (a.campaign.budgetCents !== b.campaign.budgetCents) {
        return b.campaign.budgetCents - a.campaign.budgetCents;
      }
      return a.campaign.id < b.campaign.id ? -1 : a.campaign.id > b.campaign.id ? 1 : 0;
    });
}
