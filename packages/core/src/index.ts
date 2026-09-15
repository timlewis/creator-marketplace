export { GENRES, genreLabel, isGenre, relateGenres } from './genres.js';
export type { Genre, GenreRelation } from './genres.js';

export { formatCents, formatCount, formatMultiple, formatRate } from './format.js';

export type {
  CampaignRequirements,
  CreatorProfile,
  FitComponent,
  FitComponentKey,
  FitScore,
  Ineligibility,
  IneligibilityCode,
  MatchResult,
} from './types.js';

export { FIT_WEIGHTS, rankMatches, scoreMatch } from './matching.js';
export type { RankedMatch } from './matching.js';

export { ALGORITHM_VERSION, selectWinners } from './auction.js';
export type {
  AuctionBid,
  AuctionOutcome,
  AuctionPlacement,
  LossReason,
  SelectWinnersInput,
} from './auction.js';

export { suggestBidRange } from './pricing.js';
export type { BidGuidance } from './pricing.js';
