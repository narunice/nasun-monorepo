/**
 * Lazy loading with retry + stale-chunk recovery.
 *
 * Two failure modes:
 * 1. Transient network blip → backoff retry usually recovers.
 * 2. Stale chunk after deploy → chunk hash 404s permanently. Reload with
 *    cache-busting query so CDN edge serves fresh index.html.
 *
 * Timestamp-based guard (60s) prevents reload loops while still allowing
 * a later deploy to trigger another auto-reload in the same tab.
 */
import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'chunk-reload-at';

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const mod = await factory();
        sessionStorage.removeItem(RELOAD_KEY);
        return mod;
      } catch (error) {
        const isLast = attempt === retries;
        if (!isLast) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
        const now = Date.now();
        if (now - last < 60_000) throw error;
        sessionStorage.setItem(RELOAD_KEY, String(now));
        const url = new URL(window.location.href);
        url.searchParams.set('_r', String(now));
        window.location.replace(url.toString());
        return new Promise<{ default: T }>(() => {});
      }
    }
    throw new Error('Failed to load component after retries');
  });
}
