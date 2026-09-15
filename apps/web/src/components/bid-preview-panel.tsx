import type { BidPreview } from '@marketplace/api';
import { ApiError } from '../lib/api.js';
import { formatCents } from '../lib/format.js';
import { Skeleton } from './ui.js';

/**
 * What would happen if the auction closed right now.
 *
 * This is the real selection algorithm run against the bids that actually
 * exist, not a model of it, so the panel can state a verdict plainly. The one
 * hedge it needs - that other creators can still bid - is true and shown.
 *
 * Where a bid would lose on price, the panel works backwards from the current
 * cut-off to name the number that would clear it. Telling someone they lost
 * without telling them by how much is the part of most marketplaces that makes
 * creators feel like they are guessing.
 */

function clearingPriceCents(preview: BidPreview): number | null {
  if (!preview.clearingFitPerDollar || preview.fitScore === 0) return null;
  const threshold = Math.floor((preview.fitScore * 100) / preview.clearingFitPerDollar);
  return threshold > 0 && threshold < preview.amountCents ? threshold : null;
}

function Verdict({ preview }: { preview: BidPreview }) {
  const won = preview.wouldWin;

  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={won ? 'text-title font-semibold text-won' : 'text-title font-semibold'}>
        {won ? 'You would win this' : 'You would not win this'}
      </span>
      {preview.rank ? (
        <span className="shrink-0 text-label text-muted tabular">
          Ranked #{preview.rank} of {preview.fieldSize}
        </span>
      ) : null}
    </div>
  );
}

function Explanation({ preview }: { preview: BidPreview }) {
  if (preview.wouldWin) {
    return (
      <p className="text-body text-muted">
        {preview.projectedWinnerCount === 1
          ? 'You would be the only winner.'
          : `You would be one of ${preview.projectedWinnerCount} winners sharing the ${formatCents(
              preview.budgetCents,
            )} budget.`}{' '}
        Other creators can still bid before the deadline.
      </p>
    );
  }

  if (preview.lossReason === 'over_budget') {
    return (
      <p className="text-body text-muted">
        Your bid is more than the campaign&apos;s entire {formatCents(preview.budgetCents)} budget,
        so it could never be funded.
      </p>
    );
  }

  const threshold = clearingPriceCents(preview);
  const cause =
    preview.lossReason === 'slots_filled'
      ? `All ${preview.maxWinners} slots would go to bids offering more fit per dollar.`
      : 'The budget would run out before reaching your bid.';

  return (
    <p className="text-body text-muted">
      {cause}{' '}
      {threshold
        ? `Bidding around ${formatCents(threshold)} or less would put you above the current cut-off.`
        : 'Lowering your price or improving your fit would move you up.'}
    </p>
  );
}

export function BidPreviewPanel({
  preview,
  isPending,
  error,
}: {
  preview: BidPreview | undefined;
  isPending: boolean;
  error: unknown;
}) {
  if (error instanceof ApiError) {
    return (
      <div className="rounded-lg border border-border bg-surface-sunken p-4">
        <p className="text-body text-muted">{error.message}</p>
      </div>
    );
  }

  if (isPending || !preview) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-sunken p-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  return (
    <div
      className={
        preview.wouldWin
          ? 'flex flex-col gap-2 rounded-lg border border-transparent bg-won-soft p-4'
          : 'flex flex-col gap-2 rounded-lg border border-border bg-surface-sunken p-4'
      }
    >
      <p className="text-label font-semibold text-muted">If bidding closed right now</p>
      <Verdict preview={preview} />
      <Explanation preview={preview} />
    </div>
  );
}
