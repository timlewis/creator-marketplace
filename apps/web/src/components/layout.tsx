import { NavLink, Link } from 'react-router-dom';
import type { CreatorDto } from '@marketplace/api';
import { useCreators } from '../lib/queries.js';
import { useCurrentCreator } from '../lib/current-creator.js';
import { CreatorAvatar } from './creator-avatar.js';
import { cx } from './ui.js';

function NavTab({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          'rounded-lg px-3 py-1.5 text-body font-semibold transition-colors',
          isActive ? 'bg-surface-sunken text-foreground' : 'text-muted hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}

function ActingAs({ creator }: { creator: CreatorDto }) {
  return (
    <Link
      to="/creators"
      className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 transition-colors hover:bg-surface-sunken"
      title="Switch creator"
    >
      <CreatorAvatar displayName={creator.displayName} seed={creator.handle} size="sm" />
      <span className="hidden flex-col text-left sm:flex">
        <span className="text-label text-muted">Acting as</span>
        <span className="text-label font-semibold">{creator.displayName}</span>
      </span>
      <span className="px-1 text-label text-muted" aria-hidden>
        &#8645;
      </span>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { creatorId } = useCurrentCreator();
  const { data } = useCreators();
  const creator = data?.creators.find((c) => c.id === creatorId);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4">
          <Link to="/" className="text-body font-semibold">
            Creator Marketplace
          </Link>

          {creator ? (
            <nav className="flex items-center gap-1">
              <NavTab to="/matches">Campaigns</NavTab>
              <NavTab to="/bids">My bids</NavTab>
            </nav>
          ) : null}

          <div className="ml-auto">{creator ? <ActingAs creator={creator} /> : null}</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
