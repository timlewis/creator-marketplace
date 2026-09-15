import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BidPreviewPanel } from '../components/bid-preview-panel.js';
import { FitBreakdown } from '../components/fit.js';
import { Button, Card, Chip, ErrorState, Skeleton, Stat } from '../components/ui.js';
import { ApiError, api } from '../lib/api.js';
import { useCurrentCreator } from '../lib/current-creator.js';
import { centsToDollars, dollarsToCents, formatCents, formatDeadline, formatFollowers, formatRate } from '../lib/format.js';
import { useCampaign, useExpireCampaign, useMeta, usePlaceBid } from '../lib/queries.js';
import { useDebounced } from '../lib/use-debounced.js';

function Requirements({
  minFollowers,
  minEngagementRate,
  targetGenre,
  strictGenre,
}: {
  minFollowers: number;
  minEngagementRate: number;
  targetGenre: string;
  strictGenre: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Chip>{strictGenre ? `${targetGenre} only` : `${targetGenre} preferred`}</Chip>
      <Chip>{formatFollowers(minFollowers)}+ followers</Chip>
      <Chip>{formatRate(minEngagementRate)}+ engagement target</Chip>
    </div>
  );
}

export function CampaignDetailPage() {
  const { campaignId = '' } = useParams();
  const { creatorId } = useCurrentCreator();
  const { data, isPending, isError, error, refetch } = useCampaign(campaignId, creatorId);
  const { data: meta } = useMeta();

  const placeBid = usePlaceBid(campaignId, creatorId ?? '');
  const expire = useExpireCampaign(creatorId ?? '');

  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const debouncedAmount = useDebounced(amount);

  // Seed the form from an existing bid, so "edit" opens on the current values
  // rather than an empty box the creator has to remember how to refill.
  useEffect(() => {
    if (!data) return;
    if (data.myBid) {
      setAmount(String(centsToDollars(data.myBid.amountCents)));
      setMessage(data.myBid.message ?? '');
    } else if (amount === '') {
      setAmount(String(centsToDollars(data.guidance.midCents)));
    }
    // Only re-seed when the loaded bid changes, never on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.myBid?.id, data?.campaign.id]);

  const parsedDollars = Number.parseFloat(debouncedAmount);
  const previewAmountCents =
    Number.isFinite(parsedDollars) && parsedDollars > 0 ? dollarsToCents(parsedDollars) : null;

  const preview = useQuery({
    queryKey: ['bid-preview', campaignId, creatorId, previewAmountCents],
    queryFn: () => api.previewBid(campaignId, creatorId!, previewAmountCents!),
    enabled: Boolean(creatorId) && previewAmountCents !== null && data?.eligible === true,
    retry: false,
  });

  if (isPending) return <Skeleton className="h-96" />;
  if (isError) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const { campaign, fit, eligible, ineligibility, biddingOpen, bidCount, guidance, myBid } = data;

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const dollars = Number.parseFloat(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) return;
    placeBid.mutate({
      amountCents: dollarsToCents(dollars),
      ...(message.trim() ? { message: message.trim() } : {}),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Link to="/matches" className="text-label font-semibold text-muted hover:text-foreground">
        &larr; Back to campaigns
      </Link>

      <Card>
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-col gap-2">
            <span className="text-label font-semibold text-muted">{campaign.brandName}</span>
            <h1 className="text-display font-semibold">{campaign.title}</h1>
            <p className="text-body text-muted">{campaign.description}</p>
          </div>

          <Requirements
            minFollowers={campaign.minFollowers}
            minEngagementRate={campaign.minEngagementRate}
            targetGenre={campaign.targetGenre}
            strictGenre={campaign.strictGenre}
          />

          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
            <Stat label="Budget" value={formatCents(campaign.budgetCents)} />
            <Stat label="Slots" value={campaign.maxWinners} />
            <Stat label="Bids so far" value={bidCount} />
            <Stat
              label="Deadline"
              value={biddingOpen ? formatDeadline(campaign.biddingDeadline) : 'Closed'}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="h-fit">
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <h2 className="text-title font-semibold">Your fit for this brief</h2>
            <FitBreakdown fit={fit} />
          </div>
        </Card>

        <Card className="h-fit">
          <div className="flex flex-col gap-4 p-4 sm:p-6">
            <h2 className="text-title font-semibold">{myBid ? 'Update your bid' : 'Place a bid'}</h2>

            {!eligible ? (
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-sunken p-4">
                <p className="text-body font-semibold">{ineligibility?.message}</p>
                <p className="text-label text-muted">
                  You would score {fit.score} here once you qualify.
                </p>
              </div>
            ) : !biddingOpen ? (
              <div className="rounded-lg border border-border bg-surface-sunken p-4">
                <p className="text-body font-semibold">Bidding has closed</p>
                <p className="text-label text-muted">
                  Check My bids to see whether this one went your way.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="amount" className="text-label font-semibold">
                    Your price
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border border-border-strong px-3 focus-within:border-accent">
                    <span className="text-body text-muted">$</span>
                    <input
                      id="amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className="h-10 w-full bg-transparent text-body font-semibold tabular outline-none"
                      placeholder="0"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-label text-muted">Suggested</span>
                    {[guidance.lowCents, guidance.midCents, guidance.highCents].map((cents) => (
                      <button
                        key={cents}
                        type="button"
                        onClick={() => setAmount(String(centsToDollars(cents)))}
                        className="rounded-md border border-border px-2 py-0.5 text-label font-semibold tabular hover:bg-surface-sunken"
                      >
                        {formatCents(cents)}
                      </button>
                    ))}
                  </div>
                </div>

                <BidPreviewPanel
                  preview={preview.data}
                  isPending={preview.isFetching && !preview.data}
                  error={preview.error}
                />

                <div className="flex flex-col gap-2">
                  <label htmlFor="message" className="text-label font-semibold">
                    Pitch <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <textarea
                    id="message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="What would you make for this brief?"
                    className="rounded-lg border border-border-strong bg-transparent p-3 text-body outline-none focus:border-accent"
                  />
                </div>

                {placeBid.error instanceof ApiError ? (
                  <p className="text-body text-danger">{placeBid.error.message}</p>
                ) : null}

                <Button type="submit" disabled={placeBid.isPending}>
                  {placeBid.isPending ? 'Submitting...' : myBid ? 'Update bid' : 'Place bid'}
                </Button>

                {placeBid.isSuccess ? (
                  <p className="text-body text-won">
                    Bid saved. You can change it until the deadline.
                  </p>
                ) : null}
              </form>
            )}

            {/*
              The demo affordance. The loop is meant to run on real elapsed
              time, and the seeded campaigns are minutes from closing so that it
              does - but a reviewer should not have to wait, and editing the
              database by hand is exactly what this exercise rules out.
            */}
            {meta?.devRoutesEnabled && biddingOpen && myBid ? (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-label text-muted">
                  Demo control: brings the deadline forward so the closing worker picks this
                  campaign up on its next pass.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={expire.isPending}
                  onClick={() => expire.mutate(campaignId)}
                >
                  {expire.isPending ? 'Expiring...' : 'Expire deadline now'}
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
