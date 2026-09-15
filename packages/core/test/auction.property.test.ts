import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { selectWinners } from '../src/auction.js';
import type { AuctionBid } from '../src/auction.js';

/**
 * The example-based tests pin down behaviour we designed on purpose. These pin
 * down the invariants that must hold for inputs nobody thought to write down -
 * in particular the two that involve money and contractual obligation, where a
 * single unhandled shape is a real incident rather than a cosmetic bug.
 */

const arbBid = fc.record({
  id: fc.uuid(),
  creatorId: fc.uuid(),
  amountCents: fc.integer({ min: 1, max: 5_000_000 }),
  fitScore: fc.integer({ min: 0, max: 100 }),
  createdAt: fc
    .integer({ min: 0, max: 1_000_000 })
    .map((offset) => new Date(Date.UTC(2026, 0, 1) + offset)),
});

const arbAuction = fc.record({
  budgetCents: fc.integer({ min: 0, max: 10_000_000 }),
  maxWinners: fc.integer({ min: 0, max: 10 }),
  bids: fc.uniqueArray(arbBid, { maxLength: 40, selector: (b) => b.id }),
});

describe('selectWinners invariants', () => {
  it('never awards more than the budget, for any field of bids', () => {
    fc.assert(
      fc.property(arbAuction, (auction) => {
        const outcome = selectWinners(auction);
        expect(outcome.totalAwardedCents).toBeLessThanOrEqual(auction.budgetCents);
      }),
    );
  });

  it('never awards more slots than the campaign asked for', () => {
    fc.assert(
      fc.property(arbAuction, (auction) => {
        const outcome = selectWinners(auction);
        expect(outcome.winnerBidIds.length).toBeLessThanOrEqual(auction.maxWinners);
      }),
    );
  });

  it('accounts for every bid exactly once', () => {
    // A bid that falls out of the placements list is a creator who never finds
    // out what happened to their offer.
    fc.assert(
      fc.property(arbAuction, (auction) => {
        const outcome = selectWinners(auction);
        const placed = outcome.placements.map((p) => p.bidId).sort();
        expect(placed).toEqual(auction.bids.map((b) => b.id).sort());
      }),
    );
  });

  it('gives every loser a reason and every winner none', () => {
    fc.assert(
      fc.property(arbAuction, (auction) => {
        for (const placement of selectWinners(auction).placements) {
          if (placement.outcome === 'won') {
            expect(placement.lossReason).toBeNull();
          } else {
            expect(placement.lossReason).not.toBeNull();
          }
        }
      }),
    );
  });

  it('reconciles the awarded total against the winning bids', () => {
    fc.assert(
      fc.property(arbAuction, (auction) => {
        const outcome = selectWinners(auction);
        const summed = outcome.placements
          .filter((p) => p.outcome === 'won')
          .reduce((total, p) => total + p.amountCents, 0);
        expect(summed).toBe(outcome.totalAwardedCents);
      }),
    );
  });

  it('is independent of the order bids are supplied in', () => {
    // This is the property the closing job's retry-safety rests on: two runs
    // reading the same rows in different orders must decide the same auction.
    fc.assert(
      fc.property(arbAuction, fc.array(fc.nat()), (auction, entropy) => {
        const shuffled: AuctionBid[] = [...auction.bids];
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
          const j = (entropy[i % Math.max(1, entropy.length)] ?? i) % (i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
        }

        expect(selectWinners({ ...auction, bids: shuffled })).toEqual(selectWinners(auction));
      }),
    );
  });
});
