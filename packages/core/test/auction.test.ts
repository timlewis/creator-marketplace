import { describe, expect, it } from 'vitest';
import { ALGORITHM_VERSION, selectWinners } from '../src/auction.js';
import { bid, minutesAfterEpoch } from './factories.js';

const outcomeFor = (bids: Parameters<typeof selectWinners>[0]['bids'], overrides = {}) =>
  selectWinners({ budgetCents: 1_000_000, maxWinners: 3, bids, ...overrides });

describe('selectWinners', () => {
  it('ranks by fit delivered per dollar, not by fit or by price alone', () => {
    // The cheap-but-mediocre bid beats the expensive-but-excellent one: 60 fit
    // for $200 is better value than 90 fit for $600. A brand buying attention
    // cares what it pays per unit of fit, which is the whole premise of the rule.
    const outcome = outcomeFor([
      bid({ id: 'expensive-great', fitScore: 90, amountCents: 60_000 }),
      bid({ id: 'cheap-decent', fitScore: 60, amountCents: 20_000 }),
    ]);

    expect(outcome.placements.map((p) => p.bidId)).toEqual(['cheap-decent', 'expensive-great']);
    expect(outcome.winnerBidIds).toEqual(['cheap-decent', 'expensive-great']);
  });

  it('never awards more than the budget', () => {
    const outcome = outcomeFor(
      [
        bid({ id: 'a', fitScore: 90, amountCents: 60_000 }),
        bid({ id: 'b', fitScore: 90, amountCents: 60_000 }),
      ],
      { budgetCents: 100_000 },
    );

    expect(outcome.totalAwardedCents).toBe(60_000);
    expect(outcome.winnerBidIds).toEqual(['a']);
    expect(outcome.placements[1]).toMatchObject({ bidId: 'b', lossReason: 'budget_exhausted' });
  });

  it('keeps filling the budget after a bid it cannot afford', () => {
    // The point of scanning on past an unaffordable bid: stopping at the first
    // one that does not fit would leave $300 of budget unspent and a willing
    // creator unbooked, which serves nobody.
    const outcome = outcomeFor(
      [
        bid({ id: 'fits-first', fitScore: 100, amountCents: 50_000 }),
        bid({ id: 'too-big', fitScore: 90, amountCents: 80_000 }),
        bid({ id: 'fits-in-the-gap', fitScore: 40, amountCents: 40_000 }),
      ],
      { budgetCents: 100_000 },
    );

    expect(outcome.winnerBidIds).toEqual(['fits-first', 'fits-in-the-gap']);
    expect(outcome.totalAwardedCents).toBe(90_000);
    expect(outcome.placements.find((p) => p.bidId === 'too-big')?.lossReason).toBe(
      'budget_exhausted',
    );
  });

  it('stops at the slot limit even when budget remains', () => {
    // Budget is not the only scarce resource: a brand asking for 2 creators
    // does not want 5 just because it could afford them.
    const outcome = outcomeFor(
      [
        bid({ id: 'a', fitScore: 90, amountCents: 10_000 }),
        bid({ id: 'b', fitScore: 80, amountCents: 10_000 }),
        bid({ id: 'c', fitScore: 70, amountCents: 10_000 }),
      ],
      { budgetCents: 1_000_000, maxWinners: 2 },
    );

    expect(outcome.winnerBidIds).toEqual(['a', 'b']);
    expect(outcome.placements[2]).toMatchObject({ bidId: 'c', lossReason: 'slots_filled' });
  });

  it('excludes bids larger than the whole budget from the ranking entirely', () => {
    // A rank implies contention. A bid that could never be funded under any
    // arrangement of the field was never in contention, so it gets no rank.
    const outcome = outcomeFor(
      [
        bid({ id: 'viable', fitScore: 50, amountCents: 50_000 }),
        bid({ id: 'absurd', fitScore: 100, amountCents: 500_000 }),
      ],
      { budgetCents: 100_000 },
    );

    const absurd = outcome.placements.find((p) => p.bidId === 'absurd');
    expect(absurd).toMatchObject({ rank: null, outcome: 'lost', lossReason: 'over_budget' });
    expect(outcome.placements.find((p) => p.bidId === 'viable')?.rank).toBe(1);
  });

  it('reports the clearing bar a losing bid needed to beat', () => {
    // This is what turns "you lost" into feedback a creator can act on.
    const outcome = outcomeFor(
      [
        bid({ id: 'winner', fitScore: 80, amountCents: 20_000 }),
        bid({ id: 'loser', fitScore: 20, amountCents: 80_000 }),
      ],
      { budgetCents: 20_000, maxWinners: 1 },
    );

    expect(outcome.clearingFitPerDollar).toBeCloseTo(80 / 200, 10);
    expect(outcome.placements.find((p) => p.bidId === 'loser')?.fitPerDollar).toBeCloseTo(
      20 / 800,
      10,
    );
  });

  it('returns an empty decision for a campaign nobody bid on', () => {
    const outcome = outcomeFor([]);

    expect(outcome.winnerBidIds).toEqual([]);
    expect(outcome.totalAwardedCents).toBe(0);
    expect(outcome.clearingFitPerDollar).toBeNull();
  });

  it('stamps the algorithm version so a closure stays auditable after the rule changes', () => {
    expect(outcomeFor([]).algorithmVersion).toBe(ALGORITHM_VERSION);
  });
});

describe('selectWinners tie-breaking', () => {
  // Determinism is not cosmetic here. The closing job is allowed to run twice,
  // and "ran twice, same answer" is only observable if equal-value bids cannot
  // swap places between runs.

  it('prefers the better fit when value per dollar is identical', () => {
    const outcome = outcomeFor(
      [
        bid({ id: 'low', fitScore: 30, amountCents: 30_000 }),
        bid({ id: 'high', fitScore: 60, amountCents: 60_000 }),
      ],
      { maxWinners: 1 },
    );

    expect(outcome.winnerBidIds).toEqual(['high']);
  });

  it('prefers the cheaper ask when value per dollar and fit are identical', () => {
    const outcome = outcomeFor(
      [
        bid({ id: 'pricey', fitScore: 50, amountCents: 50_000 }),
        bid({ id: 'cheaper', fitScore: 50, amountCents: 25_000 }),
      ],
      { maxWinners: 1 },
    );

    // Equal fit per dollar, equal fit: the cheaper bid leaves budget for others.
    expect(outcome.winnerBidIds).toEqual(['cheaper']);
  });

  it('prefers the earlier bid when price and fit are identical', () => {
    const outcome = outcomeFor(
      [
        bid({ id: 'later', createdAt: minutesAfterEpoch(10) }),
        bid({ id: 'earlier', createdAt: minutesAfterEpoch(1) }),
      ],
      { maxWinners: 1 },
    );

    expect(outcome.winnerBidIds).toEqual(['earlier']);
  });

  it('falls back to bid id so the ordering is always total', () => {
    const outcome = outcomeFor([bid({ id: 'bbb' }), bid({ id: 'aaa' })], { maxWinners: 1 });

    expect(outcome.winnerBidIds).toEqual(['aaa']);
  });

  it('produces an identical decision regardless of the order bids arrive in', () => {
    // The closing job reads bids from Postgres, which makes no ordering promise
    // without an ORDER BY. The result must not depend on that.
    const bids = [
      bid({ id: 'a', fitScore: 70, amountCents: 30_000 }),
      bid({ id: 'b', fitScore: 70, amountCents: 30_000, createdAt: minutesAfterEpoch(5) }),
      bid({ id: 'c', fitScore: 40, amountCents: 10_000 }),
      bid({ id: 'd', fitScore: 95, amountCents: 90_000 }),
    ];

    const forwards = outcomeFor(bids, { budgetCents: 70_000, maxWinners: 2 });
    const backwards = outcomeFor([...bids].reverse(), { budgetCents: 70_000, maxWinners: 2 });

    expect(backwards).toEqual(forwards);
  });
});

describe('selectWinners input validation', () => {
  // These are crashes on purpose. Both conditions mean a caller has a bug, and
  // silently awarding money on bad input is worse than failing the close.

  it('refuses a bid with a non-positive amount', () => {
    expect(() => outcomeFor([bid({ id: 'free', amountCents: 0 })])).toThrow(/non-positive/);
  });

  it('refuses duplicate bid ids', () => {
    expect(() => outcomeFor([bid({ id: 'dupe' }), bid({ id: 'dupe' })])).toThrow(/Duplicate/);
  });
});
