import { describe, expect, it } from 'vitest';
import { suggestBidRange } from '../src/pricing.js';
import { campaign } from './factories.js';

describe('suggestBidRange', () => {
  const brief = campaign({ budgetCents: 900_000, maxWinners: 3 });

  it('anchors on the campaign budget split across its winner slots', () => {
    expect(suggestBidRange(brief, 50).slotBudgetCents).toBe(300_000);
  });

  it('suggests more to a stronger fit', () => {
    // A creator who scores 95 has leverage a creator who scores 20 does not,
    // and the guidance should say so rather than quoting everyone the average.
    const strong = suggestBidRange(brief, 95);
    const weak = suggestBidRange(brief, 20);

    expect(strong.midCents).toBeGreaterThan(weak.midCents);
  });

  it('never suggests bidding more than the entire campaign budget', () => {
    // A single-slot campaign is where this bites: 1.15x of the slot budget is
    // 1.15x of the whole budget, which could never be funded.
    const singleSlot = campaign({ budgetCents: 100_000, maxWinners: 1 });
    const guidance = suggestBidRange(singleSlot, 100);

    expect(guidance.highCents).toBeLessThanOrEqual(100_000);
  });

  it('returns a coherent low <= mid <= high range at every fit level', () => {
    for (let fit = 0; fit <= 100; fit += 5) {
      const { lowCents, midCents, highCents } = suggestBidRange(brief, fit);
      expect(lowCents).toBeLessThanOrEqual(midCents);
      expect(midCents).toBeLessThanOrEqual(highCents);
    }
  });

  it('never suggests a non-positive bid, even on a trivial budget', () => {
    const guidance = suggestBidRange(campaign({ budgetCents: 1, maxWinners: 5 }), 0);
    expect(guidance.lowCents).toBeGreaterThan(0);
  });
});
