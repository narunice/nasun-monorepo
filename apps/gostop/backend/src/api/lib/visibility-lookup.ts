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
