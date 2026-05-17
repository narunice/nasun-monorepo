/**
 * Wallet -> Nasun identityId resolver, Postgres-only.
 *
 * Background: chat-server resolves wallet->identityId via DynamoDB UserWallets.
 * gostop-api intentionally avoids that path so the prod EC2 IAM surface stays
 * unchanged (no DDB read role). Instead we read identity_id from the
 * cross-schema `public.activity_points` table — every wallet that has earned
 * a point ever has at least one row, and `idx_ap_wallet` makes the lookup a
 * single index seek.
 *
 * Edge cases:
 *   - Brand-new wallet with zero activity_points: returns null. /me/ecosystem
 *     then serves zeros (correct — no points, no missions, no snapshot).
 *   - Stale identity (re-linked wallet): the freshest row wins (ORDER BY
 *     tx_timestamp DESC LIMIT 1). Identity_id flips are rare and self-heal
 *     within one cache TTL.
 *
 * Cache: process-local TTL Map. Misses cached briefly so a wallet that earns
 * its first point shows up on next /me/ecosystem within ~1 minute, without
 * hammering the index on repeat polling.
 */

import type { Sql } from 'postgres';

const HIT_TTL_MS = 5 * 60 * 1000;
const MISS_TTL_MS = 60 * 1000;
const CACHE_MAX = 5_000;

type Entry = { value: string | null; expiresAt: number };
const cache = new Map<string, Entry>();

function evictIfFull(): void {
  if (cache.size < CACHE_MAX) return;
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
    if (cache.size < CACHE_MAX) return;
  }
  const first = cache.keys().next().value;
  if (first !== undefined) cache.delete(first);
}

export async function resolveIdentityId(
  sql: Sql,
  wallet: string,
): Promise<string | null> {
  const key = wallet.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  // wallet_address is written lowercase by all nasun writers (pado,
  // network-explorer Lambdas, baram). Match raw to keep the idx_ap_wallet
  // seek. If we ever observe legacy mixed-case rows breaking lookups, add a
  // functional index on LOWER(wallet_address) rather than wrapping LOWER()
  // here (would force a seqscan on a 100M+ row table).
  const rows = await sql<{ identity_id: string | null }[]>`
    SELECT identity_id
    FROM public.activity_points
    WHERE wallet_address = ${key} AND identity_id IS NOT NULL
    ORDER BY tx_timestamp DESC
    LIMIT 1
  `;
  const identityId = rows[0]?.identity_id ?? null;

  evictIfFull();
  cache.set(key, {
    value: identityId,
    expiresAt: Date.now() + (identityId ? HIT_TTL_MS : MISS_TTL_MS),
  });
  return identityId;
}
