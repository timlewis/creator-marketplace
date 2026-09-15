/**
 * Tiny deterministic formatters used to build creator-facing explanation strings.
 *
 * Hand-rolled rather than `Intl` so that explanation text is byte-identical
 * across environments — these strings get snapshotted onto bids and compared in
 * idempotency tests, so they must not depend on the host's ICU data or locale.
 */

/** 124000 -> "124,000" */
export function formatCount(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 0.042 -> "4.2%" */
export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** 2.53 -> "2.5x" */
export function formatMultiple(value: number): string {
  return `${value.toFixed(1)}x`;
}

/** 1234500 -> "$12,345" (cents in, whole dollars out) */
export function formatCents(cents: number): string {
  return `$${formatCount(cents / 100)}`;
}
