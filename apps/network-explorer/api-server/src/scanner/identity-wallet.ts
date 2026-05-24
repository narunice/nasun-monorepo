/**
 * Identity ↔ wallet mapping from activity_points (18M+ rows, growing).
 *
 * Two shapes used by tier-worker syncs:
 *
 *   getLatestWalletPerIdentity()  — 1 representative wallet per identity.
 *                                   Used by nsi-compute Stage F (txMap key
 *                                   + user_nsi.wallet_address display).
 *
 *   getAllWalletsPerIdentity()    — all distinct wallets per identity.
 *                                   Used by staking-principal-sync to sum
 *                                   staked NSN across every wallet an
 *                                   identity controls (matches the
 *                                   daily-nft-check.ts semantics).
 *
 * Both use loose index scan (skip scan) emulated via recursive CTE +
 * CROSS JOIN LATERAL: walk from one key to the next via index range
 * lookups instead of a full 18M-row dedupe. Cost grows with #distinct
 * keys (~60k identities / ~68k (identity, wallet) pairs), not #rows.
 *
 * Critical detail: the LATERAL pattern packs both result columns into
 * one subquery, so each iteration does ONE index lookup, not two. The
 * earlier two-SubPlan shape (separate scalar subqueries per column)
 * doubled the work and amplified cold-cache cost from <1s to 30s+.
 *
 * Indexes required:
 *   idx_ap_identity_latest_wallet (identity_id, tx_timestamp DESC)
 *                                   INCLUDE (wallet_address) WHERE both NOT NULL
 *   idx_ap_identity_wallet        (identity_id, wallet_address)
 *                                   WHERE both NOT NULL
 *
 * Concurrency: nsi-compute and staking-principal-sync both call these
 * helpers, and tier-worker fires syncs together on boot / aligned ticks.
 * Two concurrent calls evict each other's index pages from
 * shared_buffers. We dedupe in-flight calls (single Promise) and cache
 * the result so the second caller in a cycle gets a zero-cost hit.
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

async function loadLatestWalletPerIdentity(): Promise<Map<string, string>> {
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
      SELECT n.identity_id, n.wallet_address
      FROM t
      CROSS JOIN LATERAL (
        SELECT ap.identity_id, ap.wallet_address
        FROM activity_points ap
        WHERE ap.identity_id > t.identity_id
          AND ap.wallet_address IS NOT NULL
          AND ap.identity_id IS NOT NULL
        ORDER BY ap.identity_id ASC, ap.tx_timestamp DESC
        LIMIT 1
      ) n
      WHERE t.identity_id IS NOT NULL
    )
    SELECT identity_id, wallet_address FROM t WHERE identity_id IS NOT NULL
  `;
  const out = new Map<string, string>();
  for (const r of rows) out.set(r.identity_id, r.wallet_address);
  return out;
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

export const getLatestWalletPerIdentity = makeMemo(loadLatestWalletPerIdentity);
export const getAllWalletsPerIdentity = makeMemo(loadAllWalletsPerIdentity);
