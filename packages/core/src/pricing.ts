import type { CampaignRequirements } from './types.js';

export interface BidGuidance {
  /** Budget divided evenly across the winner slots: the naive going rate. */
  slotBudgetCents: number;
  lowCents: number;
  midCents: number;
  highCents: number;
}

/** Strong fits can credibly ask above the even split; weak fits need to undercut. */
const MIN_FIT_FACTOR = 0.6;
const FIT_FACTOR_RANGE = 0.6;

/**
 * Suggest a bid range for a creator on a campaign.
 *
 * This is guidance, not a prediction: it is derived only from the campaign's own
 * published terms and the creator's fit, never from other creators' bids. The
 * live ranking preview is where competitive information belongs, and it is
 * labelled as such - inventing a "creators like you bid $X" number from seeded
 * data would be a lie dressed up as a feature.
 */
export function suggestBidRange(
  campaign: Pick<CampaignRequirements, 'budgetCents' | 'maxWinners'>,
  fitScore: number,
): BidGuidance {
  const slots = Math.max(1, campaign.maxWinners);
  const slotBudgetCents = Math.floor(campaign.budgetCents / slots);

  const fitFactor = MIN_FIT_FACTOR + FIT_FACTOR_RANGE * (Math.min(100, Math.max(0, fitScore)) / 100);
  const midCents = Math.max(1, Math.round(slotBudgetCents * fitFactor));

  const lowCents = Math.max(1, Math.round(midCents * 0.8));
  const highCents = Math.min(campaign.budgetCents, Math.round(midCents * 1.15));

  return {
    slotBudgetCents,
    lowCents,
    midCents: Math.min(midCents, highCents),
    highCents: Math.max(lowCents, highCents),
  };
}
