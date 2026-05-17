/**
 * Single-player visibility lookup used by /round and /streak.
 *
 * Distinct from feed-server's `loadVisibilityMap` (which snapshots the full
 * non-public set into one Map for per-connection fan-out). Here we need a
 * single-row lookup on the request path, so we hit user_settings directly
 * with the row's natural PK index. Response-level caches (5s / 60s) absorb
 * the repeat-query rate.
 */

import type { Sql } from 'postgres';
import { cacheGet, cacheSet } from './cache.js';
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
export async function loadVisibilityClassification(
  sql: Sql,
): Promise<VisibilityClassification> {
  const cached = cacheGet<Array<[string, FeedVisibility]>>(VISIBILITY_MAP_CACHE_KEY);
  let entries: Array<[string, FeedVisibility]>;
  if (cached) {
    entries = cached.value;
  } else {
    const rows = await sql<Array<{ player: string; feed_visibility: FeedVisibility }>>`
      SELECT player, feed_visibility
      FROM gostop.user_settings
      WHERE feed_visibility <> 'public'
    `;
    entries = rows.map((r) => [r.player.toLowerCase(), r.feed_visibility]);
    cacheSet(VISIBILITY_MAP_CACHE_KEY, entries, VISIBILITY_MAP_TTL_SECONDS);
  }
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
