import { GENRES } from '@marketplace/core';
import type { FitComponent, Genre } from '@marketplace/core';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The genre vocabulary is defined once, in the domain package, and projected
 * into Postgres as an enum from there. Adding a genre in one place and
 * forgetting the other is then a compile error rather than a runtime surprise.
 */
export const genreEnum = pgEnum('genre', GENRES as unknown as [Genre, ...Genre[]]);

export const campaignStatusEnum = pgEnum('campaign_status', ['open', 'closed']);
export const bidStatusEnum = pgEnum('bid_status', ['pending', 'won', 'lost']);
export const lossReasonEnum = pgEnum('loss_reason', [
  'over_budget',
  'budget_exhausted',
  'slots_filled',
]);

/**
 * Money is stored as integer cents. `integer` caps a single amount at about
 * $21.4M, which is far above any plausible creator campaign; the tradeoff buys
 * plain JS numbers instead of the strings a bigint column would hand back.
 *
 * Engagement is stored as integer basis points (420 = 4.20%) for the same
 * reason: no floating point anywhere near a number that decides an auction.
 */
export const creators = pgTable(
  'creators',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    handle: text('handle').notNull(),
    displayName: text('display_name').notNull(),
    tagline: text('tagline').notNull(),
    genre: genreEnum('genre').notNull(),
    followerCount: integer('follower_count').notNull(),
    engagementBps: integer('engagement_bps').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('creators_handle_key').on(t.handle),
    check('creators_followers_non_negative', sql`${t.followerCount} >= 0`),
    check('creators_engagement_non_negative', sql`${t.engagementBps} >= 0`),
  ],
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandName: text('brand_name').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    budgetCents: integer('budget_cents').notNull(),
    targetGenre: genreEnum('target_genre').notNull(),
    strictGenre: boolean('strict_genre').notNull().default(false),
    minFollowers: integer('min_followers').notNull().default(0),
    minEngagementBps: integer('min_engagement_bps').notNull().default(0),
    maxWinners: integer('max_winners').notNull(),
    biddingDeadline: timestamp('bidding_deadline', { withTimezone: true }).notNull(),
    status: campaignStatusEnum('status').notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The closing job's candidate scan is exactly this predicate, and it is the
    // one query that runs on a schedule forever.
    index('campaigns_open_by_deadline_idx').on(t.status, t.biddingDeadline),
    check('campaigns_budget_positive', sql`${t.budgetCents} > 0`),
    check('campaigns_max_winners_positive', sql`${t.maxWinners} > 0`),
    // A campaign is closed if and only if it has a closing timestamp.
    check(
      'campaigns_closed_at_matches_status',
      sql`(${t.status} = 'closed') = (${t.closedAt} IS NOT NULL)`,
    ),
  ],
);

export const bids = pgTable(
  'bids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    /**
     * Fit is snapshotted when the bid is placed, never recomputed at close time.
     * A bid is an offer made under stated terms: re-scoring later would mean a
     * creator loses because their engagement dipped after they committed. It
     * also makes closing a pure function of rows that already existed at the
     * deadline, which is what lets the job be re-run safely.
     */
    fitScore: integer('fit_score').notNull(),
    fitBreakdown: jsonb('fit_breakdown').$type<FitComponent[]>().notNull(),
    status: bidStatusEnum('status').notNull().default('pending'),
    lossReason: lossReasonEnum('loss_reason'),
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One offer per creator per campaign, editable until the deadline. Makes the
    // bid form an upsert and removes "which of my three bids counts?" entirely.
    uniqueIndex('bids_one_per_creator_per_campaign').on(t.campaignId, t.creatorId),
    index('bids_by_creator_idx').on(t.creatorId),
    index('bids_by_campaign_status_idx').on(t.campaignId, t.status),
    check('bids_amount_positive', sql`${t.amountCents} > 0`),
    check('bids_fit_score_range', sql`${t.fitScore} BETWEEN 0 AND 100`),
    // Only a lost bid may carry a loss reason.
    check(
      'bids_loss_reason_matches_status',
      sql`(${t.lossReason} IS NULL) OR (${t.status} = 'lost')`,
    ),
  ],
);

/**
 * The audit receipt for a closed auction.
 *
 * `campaigns.status` already records that a campaign closed, so this table is
 * not needed to answer "is it closed". It exists for two other reasons:
 *
 *  - it records *what was decided and by which rule version*, so a closure
 *    stays explainable after the selection algorithm changes; and
 *  - its primary key is the last line of defence on double-awarding. If a bug
 *    ever let two closes run concurrently past the row lock, the second one
 *    fails on this insert and rolls back rather than paying twice.
 */
export const campaignClosures = pgTable(
  'campaign_closures',
  {
    campaignId: uuid('campaign_id')
      .primaryKey()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
    totalAwardedCents: integer('total_awarded_cents').notNull(),
    winnerCount: integer('winner_count').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    decision: jsonb('decision').notNull(),
  },
  (t) => [
    check('closures_total_non_negative', sql`${t.totalAwardedCents} >= 0`),
    check('closures_winner_count_non_negative', sql`${t.winnerCount} >= 0`),
  ],
);

export type CreatorRow = typeof creators.$inferSelect;
export type CampaignRow = typeof campaigns.$inferSelect;
export type BidRow = typeof bids.$inferSelect;
export type CampaignClosureRow = typeof campaignClosures.$inferSelect;
