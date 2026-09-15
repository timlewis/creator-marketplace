/**
 * Winner selection.
 *
 * This module is deliberately pure and synchronous: it takes the bids that
 * existed at the deadline and returns a decision. It never reads a clock, a
 * database or a random source, which is what makes re-running a close produce a
 * byte-identical result and therefore makes the closing job safe to retry.
 */

/** Bump when the selection rule changes. Recorded on every closure for auditability. */
export const ALGORITHM_VERSION = 'greedy-fit-per-dollar-v1';

export interface AuctionBid {
  id: string;
  creatorId: string;
  amountCents: number;
  /** Snapshotted when the bid was placed, not recomputed at close time. */
  fitScore: number;
  createdAt: Date;
}

export type LossReason =
  /** The ask alone exceeds the campaign's entire budget. */
  | 'over_budget'
  /** Higher-ranked bids consumed the budget before this one could be funded. */
  | 'budget_exhausted'
  /** Every winner slot was taken by a higher-ranked bid. */
  | 'slots_filled';

export interface AuctionPlacement {
  bidId: string;
  creatorId: string;
  amountCents: number;
  fitScore: number;
  /** Fit points bought per dollar asked. The quantity the ranking is built on. */
  fitPerDollar: number;
  /** Position in the ranking, 1-based. Null for bids excluded before ranking. */
  rank: number | null;
  outcome: 'won' | 'lost';
  lossReason: LossReason | null;
}

export interface AuctionOutcome {
  /** Every bid, in ranked order, with `over_budget` exclusions appended last. */
  placements: AuctionPlacement[];
  winnerBidIds: string[];
  totalAwardedCents: number;
  /**
   * Fit-per-dollar of the lowest-ranked winner: the bar a losing bid needed to
   * clear. Surfaced so a creator can be told what they were actually competing
   * against instead of just "you lost". Null when nobody won.
   */
  clearingFitPerDollar: number | null;
  algorithmVersion: string;
}

export interface SelectWinnersInput {
  budgetCents: number;
  maxWinners: number;
  bids: readonly AuctionBid[];
}

function fitPerDollar(bid: AuctionBid): number {
  return bid.fitScore / (bid.amountCents / 100);
}

/**
 * Order bids by fit-per-dollar, descending.
 *
 * The density comparison is done by cross-multiplication on integers rather
 * than by dividing, so two bids offering genuinely equal value compare exactly
 * equal and fall through to the explicit tie-breaks below. Comparing floating
 * point quotients would let 1e-16 of rounding noise decide an auction, which
 * would be both unfair and non-reproducible across runs.
 *
 * Safe from overflow for realistic inputs: fitScore <= 100 and amounts are
 * cents, so the products stay far below Number.MAX_SAFE_INTEGER.
 */
function compareBids(a: AuctionBid, b: AuctionBid): number {
  const density = b.fitScore * a.amountCents - a.fitScore * b.amountCents;
  if (density !== 0) return density;

  // Equal value per dollar: prefer the better fit, then the cheaper ask, then
  // whoever committed first. Id is the final backstop so the order is total.
  if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
  if (a.amountCents !== b.amountCents) return a.amountCents - b.amountCents;

  const placed = a.createdAt.getTime() - b.createdAt.getTime();
  if (placed !== 0) return placed;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function validate(input: SelectWinnersInput): void {
  const seen = new Set<string>();
  for (const bid of input.bids) {
    if (!Number.isInteger(bid.amountCents) || bid.amountCents <= 0) {
      throw new Error(`Bid ${bid.id} has a non-positive or fractional amount: ${bid.amountCents}`);
    }
    if (seen.has(bid.id)) {
      throw new Error(`Duplicate bid id in auction input: ${bid.id}`);
    }
    seen.add(bid.id);
  }
}

/**
 * Pick winners for one campaign.
 *
 * The rule is a greedy fill on fit-per-dollar: rank every affordable bid by the
 * fit it delivers per dollar asked, then walk the list funding each bid that
 * still fits in the remaining budget, until the slots run out.
 *
 * The walk does not stop at the first bid it cannot afford - a cheaper bid
 * further down can still use the leftover budget. Stopping early would leave
 * money unspent and a willing creator unbooked for no reason.
 *
 * Greedy rather than an exact knapsack, deliberately. See the README: the rule
 * has to be explainable to the creator who lost, and it has to reward lowering
 * your price or raising your fit monotonically. An optimal solver satisfies
 * neither, and buys a few percent of budget efficiency in exchange.
 */
export function selectWinners(input: SelectWinnersInput): AuctionOutcome {
  validate(input);

  const { budgetCents, maxWinners } = input;

  // Bids asking more than the whole budget can never be funded, whatever the
  // rest of the field looks like. Excluded before ranking so they do not occupy
  // a rank position that implies they were in contention.
  const contenders: AuctionBid[] = [];
  const excluded: AuctionBid[] = [];
  for (const bid of input.bids) {
    (bid.amountCents > budgetCents ? excluded : contenders).push(bid);
  }

  contenders.sort(compareBids);
  excluded.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const placements: AuctionPlacement[] = [];
  const winnerBidIds: string[] = [];
  let remainingCents = budgetCents;
  let totalAwardedCents = 0;
  let clearingFitPerDollar: number | null = null;

  contenders.forEach((bid, index) => {
    const base = {
      bidId: bid.id,
      creatorId: bid.creatorId,
      amountCents: bid.amountCents,
      fitScore: bid.fitScore,
      fitPerDollar: fitPerDollar(bid),
      rank: index + 1,
    };

    if (winnerBidIds.length >= maxWinners) {
      placements.push({ ...base, outcome: 'lost', lossReason: 'slots_filled' });
      return;
    }

    if (bid.amountCents > remainingCents) {
      placements.push({ ...base, outcome: 'lost', lossReason: 'budget_exhausted' });
      return;
    }

    remainingCents -= bid.amountCents;
    totalAwardedCents += bid.amountCents;
    clearingFitPerDollar = base.fitPerDollar;
    winnerBidIds.push(bid.id);
    placements.push({ ...base, outcome: 'won', lossReason: null });
  });

  for (const bid of excluded) {
    placements.push({
      bidId: bid.id,
      creatorId: bid.creatorId,
      amountCents: bid.amountCents,
      fitScore: bid.fitScore,
      fitPerDollar: fitPerDollar(bid),
      rank: null,
      outcome: 'lost',
      lossReason: 'over_budget',
    });
  }

  // Belt and braces. If the walk above ever awarded more than the budget or
  // more slots than exist, that is a correctness bug in money-handling code and
  // it must stop the close rather than get written to the database.
  if (totalAwardedCents > budgetCents) {
    throw new Error(
      `Auction awarded ${totalAwardedCents} cents against a budget of ${budgetCents}`,
    );
  }
  if (winnerBidIds.length > maxWinners) {
    throw new Error(`Auction picked ${winnerBidIds.length} winners for ${maxWinners} slots`);
  }

  return {
    placements,
    winnerBidIds,
    totalAwardedCents,
    clearingFitPerDollar,
    algorithmVersion: ALGORITHM_VERSION,
  };
}
