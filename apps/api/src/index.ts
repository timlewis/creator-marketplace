/**
 * The wire contract, exported so the frontend imports the same types the
 * server produces instead of re-declaring them and drifting.
 *
 * Types only: nothing here pulls the server runtime into a browser bundle.
 */
export type { BidDto, CampaignDto, CreatorDto } from './serializers.js';
export type { MatchDto, CampaignDetail } from './services/matching.js';
export type { BidOutcomeDetail, BidPreview, BidWithContext } from './services/bidding.js';
export type { ErrorBody } from './errors.js';

export type {
  BidGuidance,
  FitComponent,
  FitComponentKey,
  FitScore,
  Genre,
  Ineligibility,
  IneligibilityCode,
  LossReason,
} from '@marketplace/core';
