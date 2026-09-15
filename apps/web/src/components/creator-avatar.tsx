import { initials } from '../lib/format.js';
import { cx } from './ui.js';

/**
 * Initials on a tinted ground, derived from the name.
 *
 * Deterministic rather than random so a creator keeps the same colour
 * everywhere they appear, which is what makes them recognisable in a list.
 */
const TINTS = [
  'bg-[oklch(0.93_0.05_275)] text-[oklch(0.38_0.13_275)]',
  'bg-[oklch(0.93_0.05_155)] text-[oklch(0.36_0.11_155)]',
  'bg-[oklch(0.94_0.05_75)] text-[oklch(0.40_0.11_75)]',
  'bg-[oklch(0.93_0.05_25)] text-[oklch(0.40_0.13_25)]',
  'bg-[oklch(0.93_0.05_200)] text-[oklch(0.37_0.11_200)]',
  'bg-[oklch(0.93_0.05_330)] text-[oklch(0.38_0.12_330)]',
];

function tintFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length]!;
}

export function CreatorAvatar({
  displayName,
  seed,
  size = 'md',
}: {
  displayName: string;
  seed: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dimensions = size === 'lg' ? 'size-12 text-title' : size === 'sm' ? 'size-8' : 'size-10';

  return (
    <span
      aria-hidden
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'lg' ? '' : 'text-label',
        dimensions,
        tintFor(seed),
      )}
    >
      {initials(displayName)}
    </span>
  );
}
