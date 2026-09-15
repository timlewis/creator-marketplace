const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** Money is held as integer cents everywhere; this is the only place it becomes a display string. */
export const formatCents = (cents: number): string => wholeDollars.format(cents / 100);

export const formatFollowers = (count: number): string => compact.format(count);

export const formatRate = (rate: number): string => `${(rate * 100).toFixed(1)}%`;

export const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);

export const centsToDollars = (cents: number): number => Math.round(cents / 100);

/**
 * A deadline the way a creator reads one.
 *
 * Under an hour it counts down by the minute, because that is when the number
 * changes a decision. Beyond that an exact countdown is false precision, so it
 * degrades to a plain date.
 */
export function formatDeadline(iso: string, now: number = Date.now()): string {
  const remainingMs = new Date(iso).getTime() - now;

  if (remainingMs <= 0) return 'Closing now';

  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes < 1) return `Closes in ${Math.max(1, Math.floor(remainingMs / 1000))}s`;
  if (minutes < 60) return `Closes in ${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Closes in ${hours}h`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'Closes tomorrow' : `Closes in ${days} days`;
}

/** True when a deadline is close enough that the UI should draw attention to it. */
export const isUrgent = (iso: string, now: number = Date.now()): boolean => {
  const remainingMs = new Date(iso).getTime() - now;
  return remainingMs > 0 && remainingMs < 60 * 60_000;
};

export function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Turns a 0-100 fit score into the words a creator would use for it. */
export function fitLabel(score: number): string {
  if (score >= 80) return 'Excellent match';
  if (score >= 65) return 'Strong match';
  if (score >= 45) return 'Fair match';
  return 'Weak match';
}
