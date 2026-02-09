/**
 * useFavoriteMarkets
 * Shared hook for market favorites (star toggle, localStorage persistence).
 * Uses useSyncExternalStore so all consumers (MarketSelector, FavoriteStrip)
 * share a single reactive state.
 */

import { useCallback, useSyncExternalStore } from 'react';

const FAVORITES_KEY = 'pado:market:favorites';
const MAX_FAVORITES = 20;

// Module-level listeners for useSyncExternalStore
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function readFavorites(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? parsed : [];
  } catch { return []; }
}

// Cache to avoid re-parsing on every getSnapshot call
let cachedJson = localStorage.getItem(FAVORITES_KEY) ?? '[]';
let cachedValue = readFavorites();

function getSnapshot(): string[] {
  const raw = localStorage.getItem(FAVORITES_KEY) ?? '[]';
  if (raw !== cachedJson) {
    cachedJson = raw;
    cachedValue = readFavorites();
  }
  return cachedValue;
}

function writeFavorites(updater: (prev: string[]) => string[]) {
  const next = updater(getSnapshot());
  const json = JSON.stringify(next);
  localStorage.setItem(FAVORITES_KEY, json);
  cachedJson = json;
  cachedValue = next;
  listeners.forEach(cb => cb());
}

export function useFavoriteMarkets() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const toggleFavorite = useCallback((key: string) => {
    writeFavorites(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : prev.length >= MAX_FAVORITES ? prev : [...prev, key]
    );
  }, []);

  const isFavorite = useCallback((key: string) => favorites.includes(key), [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}
