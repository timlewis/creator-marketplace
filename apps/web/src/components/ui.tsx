import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

/**
 * The shared primitives.
 *
 * Every size, weight and spacing value in here comes from the four-size,
 * two-weight, 8pt scale defined in index.css. Components compose these rather
 * than reaching for one-off utilities, so the visual language stays closed.
 */

const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx('rounded-[var(--radius-card)] border border-border bg-surface', className)}
      {...props}
    />
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-foreground hover:bg-accent-hover',
  secondary: 'border border-border-strong text-foreground hover:bg-surface-sunken',
  ghost: 'text-muted hover:text-foreground hover:bg-surface-sunken',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-label' : 'h-10 px-4 text-body',
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

type ChipTone = 'neutral' | 'accent' | 'won' | 'pending' | 'lost' | 'danger';

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'bg-surface-sunken text-muted border-border',
  accent: 'bg-accent-soft text-accent border-transparent',
  won: 'bg-won-soft text-won border-transparent',
  pending: 'bg-pending-soft text-pending border-transparent',
  lost: 'bg-lost-soft text-lost border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
};

export function Chip({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-label font-semibold',
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A labelled value. Used wherever a row of campaign facts appears. */
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'urgent' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-label text-muted">{label}</span>
      <span
        className={cx(
          'text-body font-semibold tabular',
          tone === 'urgent' ? 'text-danger' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-surface-sunken', className)} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-title font-semibold">{title}</p>
      <p className="max-w-md text-body text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-4 border-danger/30 px-6 py-12 text-center">
      <div className="flex flex-col gap-2">
        <p className="text-title font-semibold">Something went wrong</p>
        <p className="max-w-md text-body text-muted">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Card>
  );
}

export { cx };
