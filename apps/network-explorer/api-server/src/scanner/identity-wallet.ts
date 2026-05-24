/**
 * All wallets per identity from activity_points (18M+ rows, growing).
 *
 * Used by:
 *   staking-principal-sync — sums staked NSN across every wallet an
 *                            identity controls (matches the
 *                            daily-nft-check.ts staking award semantics).
 *   nsi-compute Stage F    — sums tx_count across every wallet for the
 *                            tx_activity_score; first wallet is used as
 *                            display value in user_nsi.wallet_address.
 *
 * Loose index scan (skip scan) emulated via recursive CTE + CROSS JOIN
 * LATERAL: walk from one (identity_id, wallet_address) pair to the next
 * via index range lookups instead of dedup-ing 18M rows. Cost grows with
 * #distinct pairs (~68k), not #rows.
 *
 * Critical detail: the LATERAL pattern packs both result columns into one
 * subquery, so each iteration does ONE index lookup, not two. The earlier
 * two-SubPlan shape doubled the work and amplified cold-cache cost from
 * <1s to 30s+.
 *
 * Required index:
 *   idx_ap_identity_wallet (identity_id, wallet_address)
 *                          WHERE identity_id IS NOT NULL AND wallet_address IS NOT NULL
 *
 * Concurrency: both callers run inside tier-worker and may fire close in
 * time on boot or aligned ticks. In-flight Promise dedup + 15min TTL
 * cache lets one cycle share a single SQL execution between callers.
 */

import { pointsDb } from '../db.js';

const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry<T> {
  at: number;
  value: T;
}

function makeMemo<T>(loader: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  let cached: CacheEntry<T> | null = null;
  return async () => {
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const value = await loader();
        cached = { at: Date.now(), value };
        return value;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  };
}

async function loadAllWalletsPerIdentity(): Promise<Map<string, string[]>> {
  if (!pointsDb) return new Map();
  const rows = await pointsDb<Array<{ identity_id: string; wallet_address: string }>>`
    WITH RECURSIVE pairs AS (
      (
        SELECT identity_id, wallet_address
        FROM activity_points
        WHERE identity_id IS NOT NULL AND wallet_address IS NOT NULL
        ORDER BY identity_id ASC, wallet_address ASC
        LIMIT 1
      )
      UNION ALL
      SELECT n.identity_id, n.wallet_address
      FROM pairs p
      CROSS JOIN LATERAL (
        SELECT ap.identity_id, ap.wallet_address
        FROM activity_points ap
        WHERE (ap.identity_id, ap.wallet_address) > (p.identity_id, p.wallet_address)
          AND ap.identity_id IS NOT NULL
          AND ap.wallet_address IS NOT NULL
        ORDER BY ap.identity_id ASC, ap.wallet_address ASC
        LIMIT 1
      ) n
      WHERE p.identity_id IS NOT NULL
    )
    SELECT identity_id, wallet_address FROM pairs WHERE identity_id IS NOT NULL
  `;
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const list = out.get(r.identity_id) ?? [];
    list.push(r.wallet_address);
    out.set(r.identity_id, list);
  }
  return out;
}

export const getAllWalletsPerIdentity = makeMemo(loadAllWalletsPerIdentity);
