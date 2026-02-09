/**
 * useAdaptiveInterval
 * Pauses polling when the browser tab is hidden (Page Visibility API).
 * Returns the interval in ms when visible, or `false` when hidden.
 * Designed to plug directly into TanStack Query's refetchInterval option.
 */

import { useSyncExternalStore } from 'react';

// Module-level visibility state for useSyncExternalStore
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  const handler = () => listeners.forEach(cb => cb());
  document.addEventListener('visibilitychange', handler);
  return () => {
    listeners.delete(callback);
    document.removeEventListener('visibilitychange', handler);
  };
}

function getSnapshot(): boolean {
  return document.visibilityState === 'visible';
}

function getServerSnapshot(): boolean {
  return true;
}

export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Returns `intervalMs` when the page is visible, `false` when hidden.
 * Use directly as TanStack Query's `refetchInterval`.
 *
 * @example
 * const interval = useAdaptiveInterval(10_000);
 * useQuery({ ..., refetchInterval: interval });
 */
export function useAdaptiveInterval(intervalMs: number): number | false {
  const visible = usePageVisible();
  return visible ? intervalMs : false;
}
