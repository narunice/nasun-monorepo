/**
 * Tiny in-memory TTL cache with ETag derivation. Single-process only.
 * Tier 0 scale (~1500 DAU) does not warrant Redis.
 *
 * Known race (Tier 1 concern): a long-running fetch that started before a
 * cacheDel(prefix) can complete and cacheSet a stale value after the delete,
 * leaving that staleness in place for up to the entry's TTL. The PATCH path
 * mitigates this for the visibility snapshot by invalidating AND immediately
 * re-priming from writer() (see visibility-lookup.ts primeVisibilityCache),
 * which collapses the window to the gap between cacheDel and the primer's
 * inner cacheSet. For the leaderboard response prefix the window is bounded
 * by CACHE_TTL_SECONDS (10 s) and the racing read uses the just-primed
 * visibility, so the residual staleness is "no policy regression", just
 * pre-PATCH ranking. Generation tokens (cacheBegin/cacheSet gen-check) are
 * the right structural fix when we go multi-process.
 */

import { createHash } from 'node:crypto';

type Entry<T> = { value: T; expiresAt: number; etag: string };

const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 5_000;

function evictIfFull(): void {
  if (store.size < MAX_ENTRIES) return;
  // Drop expired first; if still full, drop oldest insertion (Map preserves order).
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
    if (store.size < MAX_ENTRIES) return;
  }
  const firstKey = store.keys().next().value;
  if (firstKey !== undefined) store.delete(firstKey);
}

export function cacheGet<T>(key: string): { value: T; etag: string } | null {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return { value: hit.value, etag: hit.etag };
}

export function cacheSet<T>(key: string, value: T, ttlSeconds: number): string {
  evictIfFull();
  const body = JSON.stringify(value);
  const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000, etag });
  return etag;
}

export function cacheDel(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
