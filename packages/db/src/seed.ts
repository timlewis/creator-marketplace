import { scoreMatch } from '@marketplace/core';
import { sql } from 'drizzle-orm';
import { toCampaignView, toCreatorProfile } from './mappers.js';
import { createDb, createPool } from './client.js';
import { requireDatabaseUrl } from './env.js';
import type { Db } from './client.js';
import { bids, campaigns, creators } from './schema.js';
import { SEED_BIDS, SEED_CAMPAIGNS, SEED_CREATORS } from './seed-data.js';

const DOLLARS = 100;

/**
 * Wipes and reloads the demo dataset.
 *
 * Destructive by design and only ever invoked explicitly. Deadlines are
 * computed relative to the moment of seeding, so the campaigns a reviewer can
 * watch close are always minutes away from whenever they actually run this.
 */
export async function seed(db: Db, now: Date = new Date()): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE ${bids}, ${campaigns}, ${creators} RESTART IDENTITY CASCADE`);

  const creatorRows = await db
    .insert(creators)
    .values(SEED_CREATORS.map((c) => ({ ...c })))
    .returning();

  const campaignRows = await db
    .insert(campaigns)
    .values(
      SEED_CAMPAIGNS.map((c) => ({
        brandName: c.brandName,
        title: c.title,
        description: c.description,
        budgetCents: c.budgetDollars * DOLLARS,
        targetGenre: c.targetGenre,
        strictGenre: c.strictGenre,
        minFollowers: c.minFollowers,
        minEngagementBps: c.minEngagementBps,
        maxWinners: c.maxWinners,
        biddingDeadline: new Date(now.getTime() + c.deadlineInMinutes * 60_000),
      })),
    )
    .returning();

  const creatorByHandle = new Map(creatorRows.map((row) => [row.handle, row]));
  const campaignByKey = new Map(
    SEED_CAMPAIGNS.map((seedCampaign, index) => [seedCampaign.key, campaignRows[index]!]),
  );

  const bidValues = SEED_BIDS.map((seedBid) => {
    const creatorRow = creatorByHandle.get(seedBid.creatorHandle);
    const campaignRow = campaignByKey.get(seedBid.campaignKey);

    if (!creatorRow)
      throw new Error(`Seed bid references unknown creator ${seedBid.creatorHandle}`);
    if (!campaignRow)
      throw new Error(`Seed bid references unknown campaign ${seedBid.campaignKey}`);

    const match = scoreMatch(toCreatorProfile(creatorRow), toCampaignView(campaignRow));

    // The seed data is authored by hand, so a bid from a creator who could not
    // actually place it is an authoring mistake. Fail the seed rather than
    // load a database state the application itself would never have produced.
    if (!match.eligible) {
      throw new Error(
        `Seed bid is impossible: ${seedBid.creatorHandle} cannot bid on ${seedBid.campaignKey} (${match.ineligibility?.message})`,
      );
    }

    return {
      campaignId: campaignRow.id,
      creatorId: creatorRow.id,
      amountCents: seedBid.amountDollars * DOLLARS,
      fitScore: match.fit.score,
      fitBreakdown: match.fit.components,
      message: seedBid.message,
    };
  });

  await db.insert(bids).values(bidValues);

  console.log(
    `Seeded ${creatorRows.length} creators, ${campaignRows.length} campaigns, ${bidValues.length} bids`,
  );

  const soonest = [...SEED_CAMPAIGNS].sort((a, b) => a.deadlineInMinutes - b.deadlineInMinutes)[0]!;
  console.log(`Soonest deadline: "${soonest.title}" in ${soonest.deadlineInMinutes} minutes`);
}

async function main(): Promise<void> {
  const pool = createPool(requireDatabaseUrl());

  try {
    await seed(createDb(pool));
  } finally {
    await pool.end();
  }
}

// Only run when invoked directly, so tests can import `seed` without side effects.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  main().catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  });
}
