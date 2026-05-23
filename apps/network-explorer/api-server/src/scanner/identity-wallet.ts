/**
 * Latest wallet per identity from activity_points (18M+ rows, growing).
 *
 * The naive `SELECT DISTINCT ON (identity_id) ... ORDER BY identity_id,
 * tx_timestamp DESC FROM activity_points` walks every one of the 18M index
 * entries to dedupe down to ~60k groups. Even on the matching index
 * `idx_ap_identity_latest_wallet (identity_id, tx_timestamp DESC) INCLUDE
 * (wallet_address)` warm-cache execution is ~33s — over the 30s
 * statement_timeout in db.ts. Symptom: tier-worker hourly sync flapped.
 *
 * Loose index scan (skip scan) emulated via recursive CTE jumps from one
 * identity to the next via `WHERE identity_id > prev` LIMIT 1, doing
 * ~60k × O(log N) lookups instead of one 18M-row scan. Warm-cache <1s,
 * cost grows with #identities not #activity rows.
 */

import { pointsDb } from '../db.js';

export async function getLatestWalletPerIdentity(): Promise<Map<string, string>> {
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
