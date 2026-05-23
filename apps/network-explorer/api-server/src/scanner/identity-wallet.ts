/**
 * Latest wallet per identity from activity_points (18M+ rows, growing).
 *
 * A naive `SELECT DISTINCT ON (identity_id) ... ORDER BY identity_id,
 * tx_timestamp DESC FROM activity_points` walks every one of the 18M index
 * entries to dedupe down to ~60k groups. Even on the matching index
 * `idx_ap_identity_latest_wallet (identity_id, tx_timestamp DESC) INCLUDE
 * (wallet_address)` warm-cache execution is ~33s — over the 30s
 * statement_timeout in db.ts.
 *
 * Loose index scan (skip scan) emulated via recursive CTE jumps from one
 * identity to the next via `WHERE identity_id > prev` LIMIT 1, doing
 * ~60k × O(log N) lookups instead of one 18M-row scan. Warm-cache <1s,
 * cost grows with #identities not #activity rows.
 *
 * Concurrency: nsi-compute Stage F and staking-principal-sync both call
 * this helper, and tier-worker fires all three syncs simultaneously on
 * boot (and on each hourly tick if their intervals drift into alignment).
 * Two concurrent helper calls evict each other's index pages from
 * shared_buffers — cold-cache time jumps from <1s to ~21s, then to 30s+
 * timeout. We dedupe in-flight calls (single Promise) and cache the
 * result for one cycle so the second caller within an hour gets a
 * zero-cost hit.
 */

import { pointsDb } from '../db.js';

const CACHE_TTL_MS = 15 * 60 * 1000; // < interval (60min), > drift between sync timers
let inflight: Promise<Map<string, string>> | null = null;
let cached: { at: number; map: Map<string, string> } | null = null;

async function fetchFromDb(): Promise<Map<string, string>> {
  if (!pointsDb) return new Map();
  const rows = await pointsDb<Array<{ identity_id: string; wallet_address: string }>>`
    WITH RECURSIVE t AS (
      (
        SELECT identity_id, wallet_address
        FROM activity_points
        WHERE wallet_address IS NOT NULL AND identity_id IS NOT NULL
        ORDER BY identity_id ASC, tx_timestamp DESC
        LIMIT 1
      )
      UNION ALL
      SELECT
        (SELECT ap.identity_id
         FROM activity_points ap
         WHERE ap.identity_id > t.identity_id
           AND ap.wallet_address IS NOT NULL
           AND ap.identity_id IS NOT NULL
         ORDER BY ap.identity_id ASC, ap.tx_timestamp DESC
         LIMIT 1),
        (SELECT ap.wallet_address
         FROM activity_points ap
         WHERE ap.identity_id > t.identity_id
           AND ap.wallet_address IS NOT NULL
           AND ap.identity_id IS NOT NULL
         ORDER BY ap.identity_id ASC, ap.tx_timestamp DESC
         LIMIT 1)
      FROM t
      WHERE t.identity_id IS NOT NULL
    )
    SELECT identity_id, wallet_address
    FROM t
    WHERE identity_id IS NOT NULL
  `;
  const out = new Map<string, string>();
  for (const r of rows) out.set(r.identity_id, r.wallet_address);
  return out;
}

export async function getLatestWalletPerIdentity(): Promise<Map<string, string>> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.map;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const map = await fetchFromDb();
      cached = { at: Date.now(), map };
      return map;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
