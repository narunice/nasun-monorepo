/**
 * Lazy loading with retry + stale-chunk recovery.
 *
 * Two failure modes:
 * 1. Transient network blip → backoff retry (1s, 2s) usually recovers.
 * 2. Stale chunk after deploy → chunk hash 404s permanently. Reload with
 *    cache-busting query so CDN edge serves fresh index.html.
 *
 * Two-layer guard against reload loops:
 *   a. 60s window between reloads (handles transient CDN propagation).
 *   b. Hard cap of MAX_SESSION_RELOADS per tab (handles a genuinely broken
 *      deploy where the new index.html still references missing chunks).
 *      After the cap, the error surfaces to the ErrorBoundary so the user
 *      sees a "Reload page" prompt instead of being stuck in a reload loop.
 *
 * 2026-05-16~24 was a forced-disabled window for reload-loop diagnosis;
 * pado/gostop ran the same logic without incident, so re-enabling with
 * the extra session-cap guard is the safer-than-original behavior.
 */
import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "chunk-reload-at";
const RELOAD_COUNT_KEY = "chunk-reload-count";
const MAX_SESSION_RELOADS = 3;

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const mod = await factory();
        sessionStorage.removeItem(RELOAD_KEY);
        sessionStorage.removeItem(RELOAD_COUNT_KEY);
        return mod;
      } catch (error) {
        const isLast = attempt === retries;
        if (!isLast) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
        const count = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? 0);
        const now = Date.now();
        if (now - last < 60_000 || count >= MAX_SESSION_RELOADS) {
          // Either we just reloaded, or we've hit the session cap.
          // Surface to the ErrorBoundary so the user sees a real prompt
          // instead of a silent reload loop.
          throw error;
        }
        sessionStorage.setItem(RELOAD_KEY, String(now));
        sessionStorage.setItem(RELOAD_COUNT_KEY, String(count + 1));
        const url = new URL(window.location.href);
        url.searchParams.set("_r", String(now));
        window.location.replace(url.toString());
        return new Promise<{ default: T }>(() => {});
      }
    }
    throw new Error("Failed to load component after retries");
  });
}
