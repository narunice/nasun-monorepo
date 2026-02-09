/**
 * useFollowedTraders Hook
 * localStorage-based trader following with cross-tab sync.
 */

import { useSyncExternalStore, useCallback } from 'react';

const STORAGE_KEY = 'pado-followed-traders';
const MAX_FOLLOWED = 50;

// In-memory cache for snapshot stability
let cache: string[] | null = null;

// Same-tab listeners (StorageEvent only fires cross-tab)
let listeners: Array<() => void> = [];

function getSnapshot(): string[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { cache = []; return cache; }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) { cache = []; return cache; }
    cache = parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_FOLLOWED);
  } catch {
    cache = [];
  }
  return cache;
}

function getServerSnapshot(): string[] {
  return [];
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.push(onStoreChange);
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null; // Invalidate cache for cross-tab updates
      onStoreChange();
    }
  };
  window.addEventListener('storage', handler);
  return () => {
    listeners = listeners.filter(l => l !== onStoreChange);
    window.removeEventListener('storage', handler);
  };
}

function setFollowed(addresses: string[]): void {
  cache = addresses;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
  // Notify same-tab listeners directly (no cache invalidation needed)
  listeners.forEach(l => l());
}

/** @internal Reset module state for tests only */
export function _resetForTesting(): void {
  cache = null;
  listeners = [];
}

export interface UseFollowedTradersResult {
  followedAddresses: string[];
  isFollowing: (addr: string) => boolean;
  toggleFollow: (addr: string) => void;
  followCount: number;
}

export function useFollowedTraders(): UseFollowedTradersResult {
  const followedAddresses = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isFollowing = useCallback(
    (addr: string) => followedAddresses.includes(addr),
    [followedAddresses],
  );

  const toggleFollow = useCallback(
    (addr: string) => {
      const current = getSnapshot();
      if (current.includes(addr)) {
        setFollowed(current.filter(a => a !== addr));
      } else {
        if (current.length >= MAX_FOLLOWED) return; // Cap reached
        setFollowed([...current, addr]);
      }
    },
    [],
  );

  return {
    followedAddresses,
    isFollowing,
    toggleFollow,
    followCount: followedAddresses.length,
  };
}
