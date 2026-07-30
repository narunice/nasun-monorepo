/**
 * localStorage persistence for the shared QueryClient.
 *
 * Why: the origin moved from Seoul to Helsinki in the AWS exit, so every
 * uncached request from KR costs ~600ms TTFB (measured 2026-07-30: origin
 * compute is 0.2-16ms, the rest is round trip). The in-memory query cache
 * dies on reload, so each page load re-paid that round trip with a blank
 * panel on screen. Persisting the cache lets restored data paint immediately
 * while the network revalidates behind it.
 *
 * Two safety rules govern what lands in localStorage:
 *
 * 1. ALLOWLIST ONLY. Admin views, bug reports, creator posts, agent budgets,
 *    wallet balances and external DeFi positions are never persisted -- they
 *    are either privileged or change too fast to be worth showing stale.
 * 2. The snapshot is dropped on logout (AuthProvider.clearAllAuthState), so a
 *    second user on the same browser cannot read the first user's data.
 *
 * The buster is the build timestamp, so any deploy invalidates every stored
 * snapshot and no schema-changed payload is ever restored into new code.
 */

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Query } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";

export const QUERY_CACHE_STORAGE_KEY = "nasun-rq-cache";

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * First element of the queryKey for caches that are safe to keep on disk.
 * Anything not listed here is dropped at dehydrate time. Add to this set
 * deliberately: the test is "would a stale copy of this on a shared browser
 * be harmless, and is it worth a blank panel to avoid?"
 */
const PERSISTED_KEY_ROOTS: ReadonlySet<string> = new Set([
  "ecosystem",
  "ecosystem-all-time-percentile",
  "ecosystem-leaderboard",
  "uju",
  "ujuFeed",
  "nasun-standing",
  "nasun-stats-meta",
]);

/**
 * localStorage throws in Safari private mode and when the quota is full.
 * A persistence failure must never break the app, so fall back to a no-op
 * store: the app then behaves exactly as it did before persistence existed.
 */
function safeStorage(): Storage | null {
  try {
    const probe = "__nasun_rq_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = safeStorage();

const persister = createSyncStoragePersister({
  storage,
  key: QUERY_CACHE_STORAGE_KEY,
  // Batch writes: without this every query settle rewrites the whole snapshot.
  throttleTime: 2_000,
});

export const queryPersistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  maxAge: MAX_AGE_MS,
  // `define`d by vite at build time; absent under vitest, which evaluates
  // modules without the vite define pass. Fall back rather than throwing a
  // ReferenceError that would take down every importer of this module.
  buster: typeof __BUILD_TIMESTAMP__ === "string" ? __BUILD_TIMESTAMP__ : "dev",
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === "success" &&
      PERSISTED_KEY_ROOTS.has(String(query.queryKey[0])),
  },
};

/** Remove the on-disk snapshot. Called from the auth teardown path. */
export function clearPersistedQueryCache(): void {
  try {
    window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
  } catch {
    // Storage unavailable -- nothing was persisted in the first place.
  }
}
