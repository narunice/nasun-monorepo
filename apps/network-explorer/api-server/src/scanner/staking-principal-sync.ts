/**
 * Hourly snapshot of every registered identity's total staked NSN principal.
 *
 * Writes one row per (identity_id, day) into `user_staking_daily_snapshots`.
 * The downstream `nsi-compute` worker averages the last 30 days to derive
 * the staking sub-score. Storing a daily history lets us reflect stake
 * additions/withdrawals over time instead of only the current balance.
 *
 * Isolation: runs in the dedicated `tier-worker` process, never in the main
 * scanLoop. The `daily-nft-check.ts` staking award path is untouched.
 *
 * Partial-failure handling: if any of an identity's wallets fail the
 * `suix_getStakes` RPC, the identity's snapshot for this cycle is skipped so
 * a transient RPC blip cannot zero out an active staker's principal. The
 * next cycle (1 hour later) retries.
 */

import { rpcCall } from '../rpc';
import { pointsDb } from '../db';
import { sendTelegramAlert } from '../utils/alert';

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1h
const RPC_CONCURRENCY = 20;
const RETENTION_DAYS = 90;

let lastSuccessAt: Date | null = null;
let errorCount24h = 0;
let timer: NodeJS.Timeout | null = null;

interface StakedSui {
  principal: string;
}
interface StakeSet {
  stakes?: StakedSui[];
}

export function startStakingPrincipalSync(): void {
  if (process.env.ENABLE_STAKING_PRINCIPAL_SYNC !== 'true') {
    console.log('[staking-principal-sync] disabled (set ENABLE_STAKING_PRINCIPAL_SYNC=true)');
    return;
  }
  if (!pointsDb) {
    console.warn('[staking-principal-sync] pointsDb unavailable, skipping');
    return;
  }
  timer = setInterval(runSync, SYNC_INTERVAL_MS);
  runSync().catch((err) => console.error('[staking-principal-sync] initial run failed', err));
}

export function stopStakingPrincipalSync(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function runSync(): Promise<void> {
  if (!pointsDb) return;
  const started = Date.now();

  try {
    // Load every (identity_id, wallet_address) pair currently visible in activity_points.
    // This is the canonical wallet→identity map maintained by the main scanner.
    const wallets = await pointsDb<Array<{ identity_id: string; wallet_address: string }>>`
      SELECT DISTINCT identity_id, wallet_address
      FROM activity_points
      WHERE wallet_address IS NOT NULL AND identity_id IS NOT NULL
    `;

    const byIdentity = new Map<string, string[]>();
    for (const { identity_id, wallet_address } of wallets) {
      const list = byIdentity.get(identity_id) ?? [];
      list.push(wallet_address);
      byIdentity.set(identity_id, list);
    }

    const results = new Map<string, { mist: bigint; partialFailure: boolean }>();
    const entries = [...byIdentity.entries()];
    for (let i = 0; i < entries.length; i += RPC_CONCURRENCY) {
      const slice = entries.slice(i, i + RPC_CONCURRENCY);
      await Promise.allSettled(
        slice.map(async ([identityId, addrs]) => {
          let totalMist = 0n;
          let partialFailure = false;
          for (const addr of addrs) {
            try {
              const stakes = await rpcCall<StakeSet[]>('suix_getStakes', [addr]);
              for (const stakeSet of stakes ?? []) {
                for (const stake of stakeSet.stakes ?? []) {
                  totalMist += BigInt(stake.principal);
                }
              }
            } catch {
              partialFailure = true;
            }
          }
          results.set(identityId, { mist: totalMist, partialFailure });
        }),
      );
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const toUpsert = [...results.entries()]
      .filter(([, v]) => !v.partialFailure)
      .map(([identityId, v]) => ({
        identity_id: identityId,
        day: today,
        staked_nsn_mist: v.mist.toString(),
      }));

    if (toUpsert.length > 0) {
      await pointsDb`
        INSERT INTO user_staking_daily_snapshots ${pointsDb(
          toUpsert,
          'identity_id',
          'day',
          'staked_nsn_mist',
        )}
        ON CONFLICT (identity_id, day) DO UPDATE SET
          staked_nsn_mist = EXCLUDED.staked_nsn_mist,
          captured_at = now()
      `;
    }

    // Retention: drop snapshots older than the look-back window we actually use,
    // plus a small audit buffer.
    await pointsDb`
      DELETE FROM user_staking_daily_snapshots
      WHERE day < CURRENT_DATE - (${RETENTION_DAYS}::int * INTERVAL '1 day')
    `;

    const skipped = results.size - toUpsert.length;
    lastSuccessAt = new Date();
    errorCount24h = 0;
    console.log(
      `[staking-principal-sync] snapshotted ${toUpsert.length} identities ` +
        `(skipped ${skipped} partial-failure) in ${Date.now() - started}ms`,
    );
  } catch (err) {
    errorCount24h++;
    console.error('[staking-principal-sync] failed', err);
    // Alert every 6th consecutive failure (≈6h of silence).
    if (errorCount24h % 6 === 1) {
      try {
        await sendTelegramAlert(
          `staking-principal-sync failed (${errorCount24h}x in 24h): ${(err as Error).message}`,
          { dedupKey: 'staking-principal-sync-fail' },
        );
      } catch {
        // Telegram failure itself is non-fatal.
      }
    }
  }
}

export function getStakingSyncHealth(): { lastSuccessAt: Date | null; errorCount24h: number } {
  return { lastSuccessAt, errorCount24h };
}
