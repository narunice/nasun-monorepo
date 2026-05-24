/**
 * Daily snapshot of every registered identity's total staked NSN principal,
 * summed across every wallet the identity controls.
 *
 * Writes one row per (identity_id, day) into `user_staking_daily_snapshots`.
 * The downstream `nsi-compute` worker averages the last 30 days to derive
 * the staking sub-score, so daily resolution is sufficient — hourly is
 * waste (60k identities × suix_getStakes RPC × 24/day = 1.4M calls/day).
 *
 * Isolation: runs in the dedicated `tier-worker` process, never in the main
 * scanLoop. The `daily-nft-check.ts` staking award path is untouched and
 * uses the same multi-wallet aggregation semantics.
 *
 * Multi-wallet semantics (CRITICAL): an identity can control multiple
 * wallets (~13% of users do — see `getAllWalletsPerIdentity`). All wallets
 * must be queried and summed. The earlier "latest wallet only" shape
 * silently undercounted principal for ~8k users, drifting NSI's staking
 * sub-score below daily-nft-check's award path.
 *
 * Partial-failure handling: if ANY of an identity's wallets fail the
 * `suix_getStakes` RPC, the identity's snapshot for this cycle is skipped
 * so a transient RPC blip cannot zero out an active staker's principal.
 * The next cycle retries.
 */

import { rpcCall } from '../rpc.js';
import { pointsDb } from '../db.js';
import { sendTelegramAlert } from '../utils/alert.js';
import { getAllWalletsPerIdentity } from './identity-wallet.js';

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const RPC_CONCURRENCY = 20;
const RETENTION_DAYS = 90;
const UPSERT_BATCH_SIZE = 10_000;

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
    const walletsByIdentity = await getAllWalletsPerIdentity();

    const results = new Map<string, { mist: bigint; partialFailure: boolean }>();
    const entries = [...walletsByIdentity.entries()];
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

    for (let i = 0; i < toUpsert.length; i += UPSERT_BATCH_SIZE) {
      const slice = toUpsert.slice(i, i + UPSERT_BATCH_SIZE);
      await pointsDb`
        INSERT INTO user_staking_daily_snapshots ${pointsDb(
          slice,
          'identity_id',
          'day',
          'staked_nsn_mist',
        )}
        ON CONFLICT (identity_id, day) DO UPDATE SET
          staked_nsn_mist = EXCLUDED.staked_nsn_mist,
          captured_at = now()
      `;
    }

    await pointsDb`
      DELETE FROM user_staking_daily_snapshots
      WHERE day < CURRENT_DATE - (${RETENTION_DAYS}::int * INTERVAL '1 day')
    `;

    const skipped = results.size - toUpsert.length;
    const totalWallets = entries.reduce((acc, [, w]) => acc + w.length, 0);
    lastSuccessAt = new Date();
    errorCount24h = 0;
    console.log(
      `[staking-principal-sync] snapshotted ${toUpsert.length} identities ` +
        `(${totalWallets} wallets, skipped ${skipped} partial-failure) in ${Date.now() - started}ms`,
    );
  } catch (err) {
    errorCount24h++;
    console.error('[staking-principal-sync] failed', err);
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
