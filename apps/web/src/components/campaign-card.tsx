import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MatchDto } from '@marketplace/api';
import { formatCents, formatDeadline, isUrgent } from '../lib/format.js';
import { FitBreakdown, FitRing } from './fit.js';
import { Button, Card, Chip, Stat } from './ui.js';

function BidStatusChip({ match }: { match: MatchDto }) {
  if (!match.myBid) return null;
  const { status, amountCents } = match.myBid;

  const tone = status === 'won' ? 'won' : status === 'lost' ? 'lost' : 'pending';
  const label = status === 'pending' ? 'Bid placed' : status === 'won' ? 'Won' : 'Lost';

  return (
    <Chip tone={tone}>
      {label} &middot; {formatCents(amountCents)}
    </Chip>
  );
}

/**
 * One campaign, as a creator scanning a list needs to see it.
 *
 * The fit ring carries the ranking at a glance; the breakdown is one click away
 * rather than always open, because a creator skimming ten campaigns wants the
 * headline and a creator considering one wants the detail. Ineligible cards
 * keep their score and gain a reason, so a locked campaign reads as "not yet"
 * instead of a dead end.
 */
export function CampaignCard({ match }: { match: MatchDto }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const { campaign, fit, eligible, ineligibility, bidCount, biddingOpen } = match;
  const urgent = isUrgent(campaign.biddingDeadline);

  return (
    <Card className={eligible ? '' : 'bg-surface-sunken'}>
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-label font-semibold text-muted">{campaign.brandName}</span>
              {campaign.strictGenre ? <Chip>{campaign.targetGenre} only</Chip> : null}
              {urgent && eligible ? <Chip tone="danger">Closing soon</Chip> : null}
              <BidStatusChip match={match} />
            </div>

            <h2
              className={
                eligible ? 'text-title font-semibold' : 'text-title font-semibold text-muted'
              }
            >
              {campaign.title}
            </h2>

            <p className="text-body text-muted">{campaign.description}</p>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1">
            <FitRing score={fit.score} />
          </div>
        </div>

        {ineligibility ? (
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <p className="text-body font-semibold">{ineligibility.message}</p>
            <p className="text-label text-muted">
              You would score {fit.score} on this brief once you qualify.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <Stat label="Budget" value={formatCents(campaign.budgetCents)} />
          <Stat label="Slots" value={campaign.maxWinners} />
          <Stat label="Bids so far" value={bidCount} />
          <Stat
            label="Deadline"
            value={biddingOpen ? formatDeadline(campaign.biddingDeadline) : 'Closing now'}
            {...(urgent ? { tone: 'urgent' as const } : {})}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowBreakdown((open) => !open)}>
            {showBreakdown ? 'Hide breakdown' : 'Why this score?'}
          </Button>

          <div className="ml-auto">
            {eligible && biddingOpen ? (
              <Link to={`/campaigns/${campaign.id}`}>
                <Button size="sm" variant={match.myBid ? 'secondary' : 'primary'}>
                  {match.myBid ? 'Edit bid' : 'Place a bid'}
                </Button>
              </Link>
            ) : (
              <Button size="sm" variant="secondary" disabled>
                {eligible ? 'Bidding closed' : 'Not eligible'}
              </Button>
            )}
          </div>
        </div>

        {showBreakdown ? <FitBreakdown fit={fit} className="border-t border-border pt-4" /> : null}
      </div>
    </Card>
  );
}
