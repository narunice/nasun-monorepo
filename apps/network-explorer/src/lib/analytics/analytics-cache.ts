import { networkConfig } from '../sui-client';

const CACHE_VERSION = 'v1';
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_CACHE_ENTRIES = 20;

function cachePrefix(): string {
  return `analytics_${networkConfig.chainId}_`;
}

function fullKey(key: string): string {
  return `${cachePrefix()}${key}_${CACHE_VERSION}`;
}

export function getCachedData<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return null;

    const { data, timestamp } = JSON.parse(raw) as { data: T; timestamp: number };
    const age = Date.now() - timestamp;

    if (age > DEFAULT_TTL_MS) {
      localStorage.removeItem(fullKey(key));
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function setCachedData<T>(key: string, data: T): void {
  try {
    // Evict oldest entries if we're at the limit
    evictIfNeeded();
    localStorage.setItem(
      fullKey(key),
      JSON.stringify({ data, timestamp: Date.now() }),
    );
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function evictIfNeeded(): void {
  try {
    const prefix = cachePrefix();
    const entries: { key: string; timestamp: number }[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;

      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const { timestamp } = JSON.parse(raw) as { timestamp: number };
        entries.push({ key: k, timestamp });
      } catch {
        // Corrupt entry — remove it
        if (k) localStorage.removeItem(k);
      }
    }

    if (entries.length >= MAX_CACHE_ENTRIES) {
      entries.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = entries.slice(0, entries.length - MAX_CACHE_ENTRIES + 1);
      for (const entry of toRemove) {
        localStorage.removeItem(entry.key);
      }
    }
  } catch {
    // ignore
  }
}
