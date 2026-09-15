import { useEffect, useState } from 'react';

/**
 * Trails a fast-changing value by `delayMs`.
 *
 * Used so the live bid preview fires once the creator stops typing rather than
 * on every keystroke: each preview runs a real auction server-side, and a
 * result that arrives mid-keystroke would flicker between verdicts.
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
