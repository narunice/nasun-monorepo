import { useState, useCallback, useEffect, useMemo } from 'react';
import { APP_REGISTRY, VALID_APP_IDS, type AppEntry } from './appRegistry';

export const MAX_PINNED = 6;

function pinnedKey(identityId: string | undefined): string {
  return identityId ? `uju:pinned-apps:${identityId}` : 'uju:pinned-apps:guest';
}

function loadPinnedIds(identityId: string | undefined): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(pinnedKey(identityId)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[]).filter(
      (id): id is string => typeof id === 'string' && VALID_APP_IDS.has(id),
    );
  } catch {
    return [];
  }
}

export interface UseAppDirectoryResult {
  pinnedIds: string[];
  pinnedApps: AppEntry[];
  isPinned: (id: string) => boolean;
  pin: (id: string) => void;
  unpin: (id: string) => void;
  atMax: boolean;
}

export function useAppDirectory(identityId: string | undefined): UseAppDirectoryResult {
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => loadPinnedIds(identityId));

  // Reload from scoped key on account switch
  useEffect(() => {
    setPinnedIds(loadPinnedIds(identityId));
  }, [identityId]);

  useEffect(() => {
    try {
      localStorage.setItem(pinnedKey(identityId), JSON.stringify(pinnedIds));
    } catch {
      // Safari private mode or storage quota exceeded
    }
  }, [pinnedIds, identityId]);

  const pin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      if (prev.includes(id) || prev.length >= MAX_PINNED) return prev;
      return [...prev, id];
    });
  }, []);

  const unpin = useCallback((id: string) => {
    setPinnedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const isPinned = useCallback(
    (id: string) => pinnedIds.includes(id),
    [pinnedIds],
  );

  const pinnedApps = useMemo(
    () =>
      pinnedIds
        .map((id) => APP_REGISTRY.find((a) => a.id === id))
        .filter((a): a is AppEntry => a !== undefined),
    [pinnedIds],
  );

  return {
    pinnedIds,
    pinnedApps,
    isPinned,
    pin,
    unpin,
    atMax: pinnedIds.length >= MAX_PINNED,
  };
}
