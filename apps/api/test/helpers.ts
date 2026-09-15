import type { Genre } from '@marketplace/core';
import { bids, campaigns, createDb, createPool, creators } from '@marketplace/db';
import type { Db } from '@marketplace/db';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { userInfo } from 'node:os';
import { buildApp } from '../src/app.js';
import type { Config } from '../src/config.js';

export function testDatabaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    `postgresql://${userInfo().username}@localhost:5432/creator_marketplace_test`
  );
}

export const testConfig = (overrides: Partial<Config> = {}): Config => ({
  DATABASE_URL: testDatabaseUrl(),
  PORT: 0,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'fatal',
  CORS_ORIGIN: '*',
  ENABLE_DEV_ROUTES: false,
  corsOrigin: true,
  ...overrides,
});

export interface ApiHarness {
  app: FastifyInstance;
  db: Db;
  close: () => Promise<void>;
}

export async function createApiHarness(configOverrides: Partial<Config> = {}): Promise<ApiHarness> {
  const pool = createPool(testDatabaseUrl());
  const db = createDb(pool);
  const app = await buildApp(db, testConfig(configOverrides));

  return {
    app,
    db,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
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

export async function insertCampaign(
  db: Db,
  overrides: Partial<typeof campaigns.$inferInsert> & { deadlineOffsetMs?: number } = {},
): Promise<string> {
  const { deadlineOffsetMs = 3_600_000, ...rest } = overrides;
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
      minEngagementBps: 300,
      maxWinners: 3,
      biddingDeadline: new Date(Date.now() + deadlineOffsetMs),
      ...rest,
    })
    .returning({ id: campaigns.id });
  return row!.id;
}
