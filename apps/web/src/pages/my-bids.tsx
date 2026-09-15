import { Link } from 'react-router-dom';
import type { BidWithContext, LossReason } from '@marketplace/api';
import { Button, Card, Chip, EmptyState, ErrorState, Skeleton, Stat } from '../components/ui.js';
import { useCurrentCreator } from '../lib/current-creator.js';
import { formatCents, formatDeadline } from '../lib/format.js';
import { useExpireCampaign, useMeta, useMyBids } from '../lib/queries.js';

/** The stored reason codes, said the way a person would say them. */
const LOSS_EXPLANATIONS: Record<LossReason, string> = {
  budget_exhausted: 'The budget ran out before reaching your bid.',
  slots_filled: 'Every slot went to a bid offering more fit per dollar.',
  over_budget: 'Your bid was more than the whole campaign budget.',
};

function Outcome({ entry }: { entry: BidWithContext }) {
  const { bid, outcome } = entry;

  if (bid.status === 'pending') {
    return (
      <p className="text-body text-muted">
        Waiting on the deadline. {formatDeadline(entry.campaign.biddingDeadline)}.
      </p>
    );
  }

  if (bid.status === 'won') {
    return (
      <p className="text-body text-won">
        Won at {formatCents(bid.amountCents)}
        {outcome?.rank ? ` — you ranked #${outcome.rank}` : ''}
        {outcome ? ` of ${outcome.winnerCount} winner${outcome.winnerCount === 1 ? '' : 's'}.` : '.'}
      </p>
    );
  }

  const reason = bid.lossReason ? LOSS_EXPLANATIONS[bid.lossReason as LossReason] : null;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-body text-muted">{reason ?? 'This bid was not selected.'}</p>
      {outcome?.rank && outcome.clearingFitPerDollar ? (
        <p className="text-label text-muted tabular">
          You ranked #{outcome.rank}. Your value was {outcome.fitPerDollar.toFixed(4)} fit per
          dollar; the last winning bid cleared {outcome.clearingFitPerDollar.toFixed(4)}.
        </p>
      ) : null}
    </div>
  );
}

function BidRow({ entry, devEnabled }: { entry: BidWithContext; devEnabled: boolean }) {
  const { creatorId } = useCurrentCreator();
  const expire = useExpireCampaign(creatorId ?? '');
  const { bid, campaign } = entry;

  const tone = bid.status === 'won' ? 'won' : bid.status === 'lost' ? 'lost' : 'pending';
  const label = bid.status === 'won' ? 'Won' : bid.status === 'lost' ? 'Lost' : 'Pending';

  return (
    <Card>
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-label font-semibold text-muted">{campaign.brandName}</span>
            <Link
              to={`/campaigns/${campaign.id}`}
              className="text-title font-semibold hover:text-accent"
            >
              {campaign.title}
            </Link>
          </div>
          <Chip tone={tone}>{label}</Chip>
        </div>

        <Outcome entry={entry} />

        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <Stat label="Your price" value={formatCents(bid.amountCents)} />
          <Stat label="Fit score" value={`${bid.fitScore} / 100`} />
          <Stat label="Campaign budget" value={formatCents(campaign.budgetCents)} />
          <Stat label="Slots" value={campaign.maxWinners} />
        </div>

        {devEnabled && bid.status === 'pending' && campaign.status === 'open' ? (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={expire.isPending}
            onClick={() => expire.mutate(campaign.id)}
          >
            {expire.isPending ? 'Expiring...' : 'Expire deadline now (demo)'}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function MyBidsPage() {
  const { creatorId } = useCurrentCreator();
  const { data, isPending, isError, error, refetch } = useMyBids(creatorId);
  const { data: meta } = useMeta();

  if (isError) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const bids = data?.bids ?? [];
  const waiting = bids.filter((entry) => entry.bid.status === 'pending').length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-display font-semibold">My bids</h1>
        <p className="text-body text-muted">
          {waiting > 0
            ? `${waiting} bid${waiting === 1 ? '' : 's'} still open. This page updates itself when the closing job runs, so there is no need to refresh.`
            : 'Every bid here has been decided.'}
        </p>
      </header>

      {isPending ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} className="h-48" />
          ))}
        </div>
      ) : null}

      {!isPending && bids.length === 0 ? (
        <EmptyState
          title="No bids yet"
          description="Once you bid on a campaign it will appear here, and stay here after the auction closes with the reason it went the way it did."
          action={
            <Link to="/matches">
              <Button>Browse campaigns</Button>
            </Link>
          }
        />
      ) : null}

      <div className="flex flex-col gap-4">
        {bids.map((entry) => (
          <BidRow key={entry.bid.id} entry={entry} devEnabled={meta?.devRoutesEnabled ?? false} />
        ))}
      </div>
    </div>
  );
}
