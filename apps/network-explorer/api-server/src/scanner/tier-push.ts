/**
 * tier-push: off-chain -> on-chain TierRegistry sync.
 *
 * Reads user_nsi rows whose latest computed tier disagrees with the
 * last value pushed to the chain, then submits a batched
 * `nasun_tier::tier::update_tiers_batch` PTB signed by tier-admin.
 *
 * Runs in its own pm2 fork (`tier-push-worker`) — process isolation from
 * `tier-worker` (which owns staking-principal-sync / lp-position-sync /
 * nsi-compute / agent-leaderboard) is intentional (D4): a tier-push crash
 * must not stall NSI computation, and vice versa.
 *
 * Filter rationale (D2):
 *   COALESCE(last_pushed_tier, 1) IS DISTINCT FROM tier
 *     -> NULL is treated as TIER_1 (matches on-chain default)
 *   AND (tier > 1 OR last_pushed_tier > 1)
 *     -> excludes never-pushed tier-1 users (no-op since chain already
 *        returns TIER_1 by default) BUT keeps tier-down to 1 transitions
 *        so the chain learns about a promotion -> demotion cycle.
 *
 * Retry: @mysten/sui's SuiClient does NOT retry signAndExecuteTransaction
 * (rpc.ts central retry covers JSON-RPC read paths only). We implement a
 * 3x exponential backoff in-loop. Cycle losses are tolerable because the
 * filter is idempotent — the same diff will reappear next cycle.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { pointsDb } from '../db.js';
import { sendTelegramAlert } from '../utils/alert.js';

const PUSH_INTERVAL_MS = Number(process.env.TIER_PUSH_INTERVAL_MS ?? 5 * 60 * 1000);
const BATCH_SIZE = 500;          // matches nasun_tier::tier DEFAULT_MAX_BATCH_SIZE
const FIRST_PUSH_LIMIT = 5_000;  // hard cap per cycle to bound first-run gas
const SIGN_RETRY_MAX = 3;

let running = false;
let lastSuccessAt: Date | null = null;
let errorCount24h = 0;

export function startTierPush(): void {
  if (process.env.ENABLE_TIER_PUSH !== 'true') {
    console.log('[tier-push] disabled (set ENABLE_TIER_PUSH=true)');
    return;
  }
  console.log(`[tier-push] enabled, interval=${PUSH_INTERVAL_MS}ms`);
  setInterval(() => {
    runPush().catch((err) => console.error('[tier-push] interval run failed', err));
  }, PUSH_INTERVAL_MS);
  runPush().catch((err) => console.error('[tier-push] initial run failed', err));
}

async function runPush(): Promise<void> {
  // Overlap guard. nsi-compute.ts has no equivalent latch (verified), so
  // we implement our own; without it a slow RPC cycle could re-enter and
  // double-push the same diff.
  if (running) return;
  running = true;
  try {
    if (!pointsDb) {
      console.warn('[tier-push] pointsDb not configured, skipping');
      return;
    }

    const rows = await pointsDb<Array<{ identity_id: string; wallet_address: string; tier: number }>>`
      SELECT identity_id, wallet_address, tier
      FROM user_nsi
      WHERE COALESCE(last_pushed_tier, 1) IS DISTINCT FROM tier
        AND (tier > 1 OR last_pushed_tier > 1)
      LIMIT ${FIRST_PUSH_LIMIT}
    `;
    if (rows.length === 0) {
      lastSuccessAt = new Date();
      return;
    }

    const packageId = requireEnv('NASUN_TIER_PACKAGE_ID');
    const registryId = requireEnv('NASUN_TIER_REGISTRY_ID');
    const adminCapId = requireEnv('NASUN_TIER_ADMIN_CAP_ID');
    const rpcUrl = process.env.SUI_RPC_URL ?? 'https://rpc.devnet.nasun.io';

    const client = new SuiClient({ url: rpcUrl });
    const signer = loadTierAdminKey();

    let pushedCount = 0;
    let batchCount = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const slice = rows.slice(i, i + BATCH_SIZE);
      if (slice.length === 0) continue;
      batchCount++;

      const tx = new Transaction();
      tx.moveCall({
        target: `${packageId}::tier::update_tiers_batch`,
        arguments: [
          tx.object(adminCapId),
          tx.object(registryId),
          tx.pure.vector('address', slice.map((r) => r.wallet_address)),
          tx.pure.vector('u8', slice.map((r) => r.tier)),
          // ctx is auto-injected by PTB; do not pass.
        ],
      });

      let result: Awaited<ReturnType<SuiClient['signAndExecuteTransaction']>> | null = null;
      let lastErr: unknown;
      for (let attempt = 0; attempt < SIGN_RETRY_MAX; attempt++) {
        try {
          result = await client.signAndExecuteTransaction({
            signer,
            transaction: tx,
            options: { showEffects: true },
          });
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < SIGN_RETRY_MAX - 1) {
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          }
        }
      }
      if (!result) throw lastErr;

      // Monorepo standard success check (probe-deep-fee.ts:77).
      // A bare `result.digest` would miss on-chain aborts (e.g. EBatchTooLarge).
      if (result.effects?.status?.status !== 'success') {
        throw new Error(`tx aborted: ${result.effects?.status?.error ?? 'unknown'}`);
      }

      // Race-safe UPDATE: capture `tier` at SELECT time and require WHERE
      // tier = $captured. If nsi-compute mutated the tier between our
      // SELECT and UPDATE, the row simply re-enters the next cycle.
      await pointsDb.begin(async (txDb) => {
        const sql = txDb as unknown as typeof pointsDb;
        if (!sql) return;
        for (const r of slice) {
          await sql`
            UPDATE user_nsi
            SET last_pushed_tier = ${r.tier}
            WHERE identity_id = ${r.identity_id} AND tier = ${r.tier}
          `;
        }
      });
      pushedCount += slice.length;
    }

    lastSuccessAt = new Date();
    errorCount24h = 0;
    console.log(`[tier-push] pushed ${pushedCount} rows in ${batchCount} batches`);
  } catch (err) {
    errorCount24h++;
    console.error('[tier-push] failed', err);
    // Throttle: only alert on the 1st failure of each 6-failure window so
    // a stuck mode does not spam the channel (~30min of failures per ping
    // at 5min interval).
    if (errorCount24h % 6 === 1) {
      await sendTelegramAlert(
        `tier-push failed (${errorCount24h}x): ${(err as Error).message}`,
        { dedupKey: 'tier-push-fail' },
      ).catch(() => {});
    }
  } finally {
    running = false;
  }
}

function loadTierAdminKey(): Ed25519Keypair {
  const raw = process.env.NASUN_TIER_ADMIN_KEY;
  if (!raw) throw new Error('NASUN_TIER_ADMIN_KEY env var is required');
  if (raw.startsWith('suiprivkey1')) {
    return Ed25519Keypair.fromSecretKey(raw);
  }
  throw new Error('NASUN_TIER_ADMIN_KEY must be bech32 suiprivkey1... format');
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required`);
  return v;
}

export function getTierPushHealth(): { lastSuccessAt: Date | null; errorCount24h: number } {
  return { lastSuccessAt, errorCount24h };
}
