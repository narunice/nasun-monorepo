import { useState, useCallback, useEffect, useMemo } from 'react';
import { APP_REGISTRY, VALID_APP_IDS, type AppEntry } from './appRegistry';

const PINNED_APPS_KEY = 'uju:pinned-apps';
export const MAX_PINNED = 6;

function loadPinnedIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PINNED_APPS_KEY) ?? '[]');
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

export function useAppDirectory(): UseAppDirectoryResult {
  const [pinnedIds, setPinnedIds] = useState<string[]>(loadPinnedIds);

  useEffect(() => {
    localStorage.setItem(PINNED_APPS_KEY, JSON.stringify(pinnedIds));
  }, [pinnedIds]);

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
