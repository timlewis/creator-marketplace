import type { Genre } from '@marketplace/core';

/**
 * Hand-authored rather than generated, because this data is the demo.
 *
 * It is shaped to exercise every path the UI can show: creators who fall below
 * a follower bar, campaigns restricted to one genre, adjacent-genre matches
 * that score partial credit, auctions that run out of budget before they run
 * out of slots, and a handful of deadlines close enough that a reviewer can
 * watch the closing job work without waiting.
 */

export interface SeedCreator {
  handle: string;
  displayName: string;
  tagline: string;
  genre: Genre;
  followerCount: number;
  engagementBps: number;
}

export interface SeedCampaign {
  key: string;
  brandName: string;
  title: string;
  description: string;
  budgetDollars: number;
  targetGenre: Genre;
  strictGenre: boolean;
  minFollowers: number;
  minEngagementBps: number;
  maxWinners: number;
  /**
   * Minutes from seed time.
   *
   * Most of these are days out on purpose. Deadlines are relative to whenever
   * the data was seeded, so short ones make the demo contradict its own README
   * within minutes of a reseed - the campaigns the instructions name by title
   * have to still be there when someone actually reads them. Watching an
   * auction close is covered by the deadline control instead, which is
   * instant and does not rot.
   */
  deadlineInMinutes: number;
}

export interface SeedBid {
  campaignKey: string;
  creatorHandle: string;
  amountDollars: number;
  message: string;
}

export const SEED_CREATORS: SeedCreator[] = [
  {
    handle: 'maya-lifts',
    displayName: 'Maya Okonkwo',
    tagline: 'Strength training for people who hate gyms',
    genre: 'fitness',
    followerCount: 128_000,
    engagementBps: 460,
  },
  {
    handle: 'trail-and-error',
    displayName: 'Greta Lindqvist',
    tagline: 'Trail running, mostly uphill',
    genre: 'fitness',
    followerCount: 78_000,
    engagementBps: 520,
  },
  {
    handle: 'kettlebell-kev',
    displayName: 'Kevin Osei',
    tagline: 'Twenty minute sessions, no equipment excuses',
    genre: 'fitness',
    followerCount: 52_000,
    engagementBps: 380,
  },
  {
    handle: 'dev-null-dan',
    displayName: 'Dan Ferreira',
    tagline: "Breaking down infrastructure so you don't have to",
    genre: 'tech',
    followerCount: 412_000,
    engagementBps: 210,
  },
  {
    handle: 'ship-it-sana',
    displayName: 'Sana Qureshi',
    tagline: 'Shipping side projects in public',
    genre: 'tech',
    followerCount: 198_000,
    engagementBps: 280,
  },
  {
    handle: 'glow-by-ines',
    displayName: 'Ines Marchetti',
    tagline: 'Skincare science, no miracle claims',
    genre: 'beauty',
    followerCount: 64_500,
    engagementBps: 680,
  },
  {
    handle: 'pixel-runback',
    displayName: 'Sam Adeyemi',
    tagline: 'Speedruns and the occasional rage quit',
    genre: 'gaming',
    followerCount: 890_000,
    engagementBps: 320,
  },
  {
    handle: 'slow-kitchen',
    displayName: 'Yuki Tanaka',
    tagline: 'One pot, six ingredients, forty minutes',
    genre: 'food',
    followerCount: 58_400,
    engagementBps: 810,
  },
  {
    handle: 'two-bags-only',
    displayName: 'Priya Raghunathan',
    tagline: 'Carry-on only, forty countries',
    genre: 'travel',
    followerCount: 205_000,
    engagementBps: 390,
  },
  {
    // Deliberately below the follower bar on most briefs: this is the account a
    // reviewer picks to see how the product handles being locked out.
    handle: 'ledger-lines',
    displayName: 'Tomas Beaulieu',
    tagline: 'Personal finance without the shame',
    genre: 'finance',
    followerCount: 31_800,
    engagementBps: 540,
  },
  {
    handle: 'reverb-room',
    displayName: 'Alex Nwosu',
    tagline: 'Bedroom producers, studio results',
    genre: 'music',
    followerCount: 156_000,
    engagementBps: 440,
  },
];

export const SEED_CAMPAIGNS: SeedCampaign[] = [
  {
    key: 'budgeting-app',
    brandName: 'Tallyhouse',
    title: 'Budgeting app beta cohort',
    description:
      'Looking for creators who can talk about money without moralising. One honest walkthrough of setting up a monthly budget in the app.',
    budgetDollars: 2_500,
    targetGenre: 'finance',
    strictGenre: false,
    minFollowers: 20_000,
    minEngagementBps: 400,
    maxWinners: 2,
    // the one short deadline: closes unaided a few minutes after seeding
    deadlineInMinutes: 5,
  },
  {
    key: 'protein-bar',
    brandName: 'Northbar',
    title: 'Protein bar relaunch',
    description:
      'New formulation, same price. We want a genuine taste test, including if you dislike it.',
    budgetDollars: 6_000,
    targetGenre: 'fitness',
    strictGenre: false,
    minFollowers: 40_000,
    minEngagementBps: 250,
    maxWinners: 2,
    deadlineInMinutes: 10 * 24 * 60,
  },
  {
    key: 'spring-strength',
    brandName: 'PulseFit',
    title: 'Spring strength challenge',
    description:
      'Six week programme launch. We are after creators whose audience actually trains, not aspirational scrollers.',
    budgetDollars: 8_000,
    targetGenre: 'fitness',
    strictGenre: false,
    minFollowers: 50_000,
    minEngagementBps: 300,
    maxWinners: 3,
    deadlineInMinutes: 9 * 24 * 60,
  },
  {
    key: 'athleisure-capsule',
    brandName: 'Meridian',
    title: 'Athleisure capsule drop',
    description: 'Twelve pieces, one weekend. Styling-led, not performance-led.',
    budgetDollars: 12_000,
    targetGenre: 'fashion',
    strictGenre: false,
    minFollowers: 60_000,
    minEngagementBps: 300,
    maxWinners: 3,
    deadlineInMinutes: 11 * 24 * 60,
  },
  {
    key: 'dev-tooling',
    brandName: 'Forkstack',
    title: 'Developer tooling launch',
    description:
      'Technical audience only. We would rather have one deep walkthrough than five shallow mentions.',
    budgetDollars: 25_000,
    targetGenre: 'tech',
    strictGenre: true,
    minFollowers: 100_000,
    minEngagementBps: 150,
    maxWinners: 2,
    deadlineInMinutes: 12 * 24 * 60,
  },
  {
    key: 'clean-beauty',
    brandName: 'Lumen Skin',
    title: 'Clean beauty range drop',
    description: 'Three SKUs, evidence-led claims only. Bring your own scepticism.',
    budgetDollars: 9_500,
    targetGenre: 'beauty',
    strictGenre: false,
    minFollowers: 50_000,
    minEngagementBps: 400,
    maxWinners: 3,
    deadlineInMinutes: 6 * 60,
  },
  {
    key: 'weeknight-meal',
    brandName: 'Sixpot',
    title: 'Weeknight meal kit',
    description: 'Four recipes, filmed in your own kitchen. No studio setups.',
    budgetDollars: 6_000,
    targetGenre: 'food',
    strictGenre: false,
    minFollowers: 25_000,
    minEngagementBps: 500,
    maxWinners: 4,
    deadlineInMinutes: 8 * 24 * 60,
  },
  {
    key: 'handheld-console',
    brandName: 'Nova Play',
    title: 'Handheld console preorder push',
    description: 'Embargoed until launch day. Large audience required, gaming only.',
    budgetDollars: 40_000,
    targetGenre: 'gaming',
    strictGenre: true,
    minFollowers: 250_000,
    minEngagementBps: 200,
    maxWinners: 2,
    deadlineInMinutes: 14 * 24 * 60,
  },
  {
    key: 'carry-on',
    brandName: 'Halden',
    title: 'Carry-on luggage field test',
    description: 'Take it on three real trips and tell us what broke.',
    budgetDollars: 14_000,
    targetGenre: 'travel',
    strictGenre: false,
    minFollowers: 75_000,
    minEngagementBps: 300,
    maxWinners: 2,
    deadlineInMinutes: 13 * 24 * 60,
  },
  {
    key: 'studio-monitor',
    brandName: 'Kessler Audio',
    title: 'Studio monitor launch',
    description: 'Music creators only. We want to hear them in a real mix, not a spec sheet read.',
    budgetDollars: 11_000,
    targetGenre: 'music',
    strictGenre: true,
    minFollowers: 100_000,
    minEngagementBps: 350,
    maxWinners: 2,
    deadlineInMinutes: 15 * 24 * 60,
  },
];

/**
 * Competing bids, so the ranking preview has a real field to rank against from
 * the first click. `maya-lifts` is left with only two bids: she is the first
 * creator in the list and therefore the one most reviewers will act as, so she
 * needs campaigns still open to her.
 */
export const SEED_BIDS: SeedBid[] = [
  {
    campaignKey: 'spring-strength',
    creatorHandle: 'trail-and-error',
    amountDollars: 3_800,
    message: 'Six week series, one post per week.',
  },
  {
    campaignKey: 'spring-strength',
    creatorHandle: 'kettlebell-kev',
    amountDollars: 4_200,
    message: 'Can film the full programme start to finish.',
  },
  {
    campaignKey: 'spring-strength',
    creatorHandle: 'slow-kitchen',
    amountDollars: 2_900,
    message: 'Meal prep angle to pair with the training plan.',
  },

  {
    campaignKey: 'protein-bar',
    creatorHandle: 'kettlebell-kev',
    amountDollars: 3_500,
    message: 'Blind taste test against two competitors.',
  },
  {
    campaignKey: 'protein-bar',
    creatorHandle: 'trail-and-error',
    amountDollars: 4_500,
    message: 'Long run fuelling test, 30km.',
  },

  {
    campaignKey: 'dev-tooling',
    creatorHandle: 'dev-null-dan',
    amountDollars: 14_000,
    message: 'Full migration walkthrough on a real codebase.',
  },
  {
    campaignKey: 'dev-tooling',
    creatorHandle: 'ship-it-sana',
    amountDollars: 9_500,
    message: 'Build a side project with it, filmed end to end.',
  },

  {
    campaignKey: 'clean-beauty',
    creatorHandle: 'glow-by-ines',
    amountDollars: 3_200,
    message: 'Ingredient breakdown plus four week trial.',
  },
  {
    campaignKey: 'clean-beauty',
    creatorHandle: 'two-bags-only',
    amountDollars: 3_800,
    message: 'Travel-sized routine angle.',
  },

  {
    campaignKey: 'handheld-console',
    creatorHandle: 'pixel-runback',
    amountDollars: 22_000,
    message: 'Launch day stream, four hours.',
  },

  {
    campaignKey: 'weeknight-meal',
    creatorHandle: 'slow-kitchen',
    amountDollars: 1_400,
    message: 'Four recipes, one shoot day.',
  },
  {
    campaignKey: 'weeknight-meal',
    creatorHandle: 'maya-lifts',
    amountDollars: 1_800,
    message: 'High protein variations on each recipe.',
  },
  {
    campaignKey: 'weeknight-meal',
    creatorHandle: 'glow-by-ines',
    amountDollars: 1_600,
    message: 'Skin-friendly swaps angle.',
  },

  {
    campaignKey: 'carry-on',
    creatorHandle: 'two-bags-only',
    amountDollars: 6_500,
    message: 'Three trips across two months.',
  },
  {
    campaignKey: 'carry-on',
    creatorHandle: 'pixel-runback',
    amountDollars: 7_200,
    message: 'Convention travel, heavy use.',
  },

  {
    campaignKey: 'budgeting-app',
    creatorHandle: 'ledger-lines',
    amountDollars: 1_600,
    message: 'Setup walkthrough with my own real numbers.',
  },
  {
    campaignKey: 'budgeting-app',
    creatorHandle: 'dev-null-dan',
    amountDollars: 2_200,
    message: 'Engineer salary budgeting angle.',
  },

  {
    campaignKey: 'studio-monitor',
    creatorHandle: 'reverb-room',
    amountDollars: 5_500,
    message: 'A/B against my current monitors in a finished mix.',
  },

  {
    campaignKey: 'athleisure-capsule',
    creatorHandle: 'glow-by-ines',
    amountDollars: 4_800,
    message: 'Styling series, six looks.',
  },
  {
    campaignKey: 'athleisure-capsule',
    creatorHandle: 'two-bags-only',
    amountDollars: 5_000,
    message: 'Packing the capsule into a carry-on.',
  },
  {
    campaignKey: 'athleisure-capsule',
    creatorHandle: 'maya-lifts',
    amountDollars: 5_200,
    message: 'Gym-to-street transitions.',
  },
];
