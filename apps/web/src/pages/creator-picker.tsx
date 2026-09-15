import { useNavigate } from 'react-router-dom';
import type { CreatorDto } from '@marketplace/api';
import { CreatorAvatar } from '../components/creator-avatar.js';
import { Card, Chip, ErrorState, Skeleton } from '../components/ui.js';
import { formatFollowers, formatRate } from '../lib/format.js';
import { useCurrentCreator } from '../lib/current-creator.js';
import { useCreators } from '../lib/queries.js';

function CreatorButton({
  creator,
  isCurrent,
  onSelect,
}: {
  creator: CreatorDto;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      className={
        isCurrent
          ? 'border-accent ring-1 ring-accent transition-shadow'
          : 'transition-colors hover:border-border-strong'
      }
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-col gap-4 p-4 text-left"
        aria-current={isCurrent}
      >
        <div className="flex items-start gap-3">
          <CreatorAvatar displayName={creator.displayName} seed={creator.handle} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-title font-semibold">{creator.displayName}</span>
            <span className="truncate text-label text-muted">@{creator.handle}</span>
          </div>
        </div>

        <p className="text-body text-muted">{creator.tagline}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={isCurrent ? 'accent' : 'neutral'}>{creator.genre}</Chip>
          <Chip>{formatFollowers(creator.followerCount)} followers</Chip>
          <Chip>{formatRate(creator.engagementRate)} engagement</Chip>
        </div>
      </button>
    </Card>
  );
}

export function CreatorPickerPage() {
  const { creatorId, setCreatorId } = useCurrentCreator();
  const { data, isPending, isError, error, refetch } = useCreators();
  const navigate = useNavigate();

  const select = (id: string): void => {
    setCreatorId(id);
    navigate('/matches');
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-display font-semibold">Who are you today?</h1>
        <p className="text-body text-muted">
          There are no accounts in this demo. Pick a creator and you will see the campaigns matched
          to their genre, audience size and engagement.
        </p>
      </header>

      {isError ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isPending
          ? Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-48" />)
          : data?.creators.map((creator) => (
              <CreatorButton
                key={creator.id}
                creator={creator}
                isCurrent={creator.id === creatorId}
                onSelect={() => select(creator.id)}
              />
            ))}
      </div>
    </div>
  );
}
