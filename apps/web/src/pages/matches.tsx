import { useState } from 'react';
import { CampaignCard } from '../components/campaign-card.js';
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui.js';
import { useCurrentCreator } from '../lib/current-creator.js';
import { useCreators, useMatches } from '../lib/queries.js';

export function MatchesPage() {
  const { creatorId } = useCurrentCreator();
  const { data, isPending, isError, error, refetch } = useMatches(creatorId);
  const { data: creatorData } = useCreators();
  const [showLocked, setShowLocked] = useState(false);

  const creator = creatorData?.creators.find((c) => c.id === creatorId);
  const eligible = data?.matches.filter((match) => match.eligible) ?? [];
  const locked = data?.matches.filter((match) => !match.eligible) ?? [];

  if (isError) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-display font-semibold">Campaigns matched to you</h1>
        <p className="text-body text-muted">
          {creator
            ? `Ranked for @${creator.handle} on genre fit, engagement against the brand's target, and how far your audience clears the minimum.`
            : 'Ranked on genre fit, engagement and audience size.'}
        </p>
      </header>

      {isPending ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-64" />
          ))}
        </div>
      ) : null}

      {!isPending && eligible.length === 0 ? (
        <EmptyState
          title="No open campaigns you can bid on"
          description="Every campaign currently open is outside your genre or above your follower count. Check the locked ones below to see what you would need to qualify."
        />
      ) : null}

      <div className="flex flex-col gap-4">
        {eligible.map((match) => (
          <CampaignCard key={match.campaign.id} match={match} />
        ))}
      </div>

      {locked.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3 border-t border-border pt-6">
            <h2 className="text-title font-semibold">
              {locked.length} campaign{locked.length === 1 ? '' : 's'} you are not eligible for
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setShowLocked((open) => !open)}
            >
              {showLocked ? 'Hide' : 'Show'}
            </Button>
          </div>

          {/*
            Shown rather than filtered away, so a creator can see what they are
            working toward instead of wondering why a brief they heard about is
            missing from the list.
          */}
          {showLocked ? (
            <div className="flex flex-col gap-4">
              {locked.map((match) => (
                <CampaignCard key={match.campaign.id} match={match} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
