import { bids, campaigns, createDb, createPool, creators } from '@marketplace/db';
import type { Db, DbPool } from '@marketplace/db';
import type { Genre } from '@marketplace/core';
import { sql } from 'drizzle-orm';
import { userInfo } from 'node:os';

export function testDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    `postgresql://${userInfo().username}@localhost:5432/creator_marketplace_test`
  );
}

export interface TestHarness {
  db: Db;
  pool: DbPool;
  close: () => Promise<void>;
}

export function createTestDb(): TestHarness {
  const pool = createPool(testDatabaseUrl());
  return { db: createDb(pool), pool, close: () => pool.end() };
}

export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE ${bids}, ${campaigns}, ${creators} RESTART IDENTITY CASCADE`);
}

let sequence = 0;
const nextSuffix = (): string => `${Date.now()}-${(sequence += 1)}`;

export async function insertCreator(
  db: Db,
  overrides: Partial<typeof creators.$inferInsert> = {},
): Promise<string> {
  const [row] = await db
    .insert(creators)
    .values({
      handle: `creator-${nextSuffix()}`,
      displayName: 'Test Creator',
      tagline: 'Testing',
      genre: 'fitness' as Genre,
      followerCount: 100_000,
      engagementBps: 400,
      ...overrides,
    })
    .returning({ id: creators.id });
  return row!.id;
}

/** `deadlineOffsetMs` is relative to now; negative means already past. */
export async function insertCampaign(
  db: Db,
  overrides: Partial<typeof campaigns.$inferInsert> & { deadlineOffsetMs?: number } = {},
): Promise<string> {
  const { deadlineOffsetMs = -60_000, ...rest } = overrides;
  const [row] = await db
    .insert(campaigns)
    .values({
      brandName: 'Test Brand',
      title: 'Test Campaign',
      description: 'A campaign under test',
      budgetCents: 1_000_000,
      targetGenre: 'fitness' as Genre,
      strictGenre: false,
      minFollowers: 0,
      minEngagementBps: 0,
      maxWinners: 3,
      biddingDeadline: new Date(Date.now() + deadlineOffsetMs),
      ...rest,
    })
    .returning({ id: campaigns.id });
  return row!.id;
}

/**
 * Fit is passed explicitly rather than scored, so each test states the exact
 * competitive shape it means to create instead of reverse-engineering a creator
 * profile that produces it.
 */
export async function insertBid(
  db: Db,
  campaignId: string,
  creatorId: string,
  amountCents: number,
  fitScore: number,
): Promise<string> {
  const [row] = await db
    .insert(bids)
    .values({ campaignId, creatorId, amountCents, fitScore, fitBreakdown: [] })
    .returning({ id: bids.id });
  return row!.id;
}
