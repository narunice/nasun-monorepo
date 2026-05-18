/**
 * Single-player visibility lookup used by /round and /streak, plus the
 * full-snapshot loaders used by feed-server WS fan-out and the leaderboard
 * route.
 *
 * Replica-coherence policy (PR-0 follow-up, Medium #1):
 *   The snapshot loaders (`loadVisibilityMap`, `loadVisibilityClassification`)
 *   always read from the WRITE database. visibility state changes via a
 *   PATCH on writer() and the cache primer below ALSO uses writer() — so
 *   the snapshot cache is invariably coherent with the last PATCH, even
 *   when a replica is lagging. Visibility decisions are auth-shaped: a
 *   stale "public" read after an opt-out PATCH leaks the player's wallet on
 *   the feed for up to 30 s, which is the exact failure we are preventing.
 *
 *   `getVisibility(sql, player)` (single-row request-path lookup) intentionally
 *   keeps the caller's sql arg. It runs once per /round and /streak request
 *   without a cache, and the additional read load belongs on the replica.
 *   The narrow race window (PATCH→reader-lag) for these endpoints is
 *   bounded by the route's own response cache (5 s) and is acceptable for
 *   Tier 0; revisit when a real replica is in place.
 */

import type { Sql } from 'postgres';
import { writer } from '../../db/client.js';
import { cacheDel, cacheGet, cacheSet } from './cache.js';
import type { FeedVisibility } from './visibility-mask.js';

export async function getVisibility(
  sql: Sql,
  player: string,
): Promise<FeedVisibility> {
  const rows = await sql<{ feed_visibility: FeedVisibility }[]>`
    SELECT feed_visibility
    FROM gostop.user_settings
    WHERE player = ${player.toLowerCase()}
  `;
  return rows[0]?.feed_visibility ?? 'public';
}

export const VISIBILITY_MAP_CACHE_KEY = 'feed:visibility-map';
const VISIBILITY_MAP_TTL_SECONDS = 30;

/** Raw cached entry array — shared shape for both Map and classification views. */
async function loadVisibilityEntries(): Promise<Array<[string, FeedVisibility]>> {
  const cached = cacheGet<Array<[string, FeedVisibility]>>(VISIBILITY_MAP_CACHE_KEY);
  if (cached) return cached.value;
  // Writer-only read (see file header). Even when reader() == writer() in
  // single-host setups, this future-proofs the snapshot against any replica
  // promotion that introduces lag.
  const sql = writer();
  const rows = await sql<Array<{ player: string; feed_visibility: FeedVisibility }>>`
    SELECT player, feed_visibility
    FROM gostop.user_settings
    WHERE feed_visibility <> 'public'
  `;
  const entries: Array<[string, FeedVisibility]> = rows.map(
    (r) => [r.player.toLowerCase(), r.feed_visibility],
  );
  cacheSet(VISIBILITY_MAP_CACHE_KEY, entries, VISIBILITY_MAP_TTL_SECONDS);
  return entries;
}

/** Map<lowercase player, FeedVisibility> for per-event lookup on the WS path. */
export async function loadVisibilityMap(): Promise<Map<string, FeedVisibility>> {
  return new Map(await loadVisibilityEntries());
}

export type VisibilityClassification = {
  optOut: string[];
  delayed: Set<string>;
  anonymous: Set<string>;
};

/**
 * Snapshot of all non-public players, classified by visibility tier. Shared
 * between feed-server WS fan-out and the leaderboard route; cache key matches
 * `loadVisibilityMap` so /me/settings PATCH invalidates both at once.
 */
export async function loadVisibilityClassification(): Promise<VisibilityClassification> {
  const entries = await loadVisibilityEntries();
  const optOut: string[] = [];
  const delayed = new Set<string>();
  const anonymous = new Set<string>();
  for (const [player, vis] of entries) {
    if (vis === 'opt-out') optOut.push(player);
    else if (vis === 'delayed') delayed.add(player);
    else if (vis === 'anonymous') anonymous.add(player);
  }
  return { optOut, delayed, anonymous };
}

/**
 * Invalidate and immediately repopulate the visibility snapshot cache from
 * writer(). Called by PATCH /me/settings right after the INSERT commits so
 * the next reader sees the post-patch entries without crossing a 30 s TTL
 * window. The narrow residual race (an in-flight load that started before
 * the PATCH and finishes after this primer) is documented at cache.ts and
 * scoped to Tier 1.
 */
export async function primeVisibilityCache(): Promise<void> {
  cacheDel(VISIBILITY_MAP_CACHE_KEY);
  await loadVisibilityEntries();
}
