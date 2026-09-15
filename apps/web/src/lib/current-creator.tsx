import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

const STORAGE_KEY = 'marketplace.currentCreatorId';

interface CurrentCreatorValue {
  creatorId: string | null;
  setCreatorId: (id: string | null) => void;
}

const CurrentCreatorContext = createContext<CurrentCreatorValue | null>(null);

/** localStorage is unavailable in some privacy modes; the app must still work. */
function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Remembering the choice is a convenience, not a requirement.
  }
}

/**
 * Which creator the visitor is acting as.
 *
 * The exercise has no accounts, so this stands in for a session. Persisting it
 * means a refresh does not dump someone back to the picker mid-flow, which
 * matters because the demo involves waiting for a deadline.
 */
export function CurrentCreatorProvider({ children }: { children: ReactNode }) {
  const [creatorId, setCreatorIdState] = useState<string | null>(readStored);

  const setCreatorId = useCallback((id: string | null) => {
    setCreatorIdState(id);
    writeStored(id);
  }, []);

  const value = useMemo(() => ({ creatorId, setCreatorId }), [creatorId, setCreatorId]);

  return <CurrentCreatorContext value={value}>{children}</CurrentCreatorContext>;
}

export function useCurrentCreator(): CurrentCreatorValue {
  const value = useContext(CurrentCreatorContext);
  if (!value) throw new Error('useCurrentCreator must be used inside CurrentCreatorProvider');
  return value;
}
