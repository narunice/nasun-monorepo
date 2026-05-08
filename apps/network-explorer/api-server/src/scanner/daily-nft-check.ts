/**
 * Daily NFT Check: NFT Health Catchup + Genesis Passive + Staking Daily/Emissions
 *
 * Runs once per day from scanLoop (after daily missions).
 *
 * 1. V2 NFT Health Catchup: bring nft_health_state up to yesterday
 *    (legacy V1 alliance-penalty branch removed 2026-05-02).
 *
 * 2. Genesis Passive: award 1 passive point per inactive day for genesis holders
 *    - Lookback 2 days to handle PM2 downtime
 *    - Idempotent via tx_digest: pp:{identityId}:{date}
 *
 * 3. Staking Daily (v2): tier-based points per day for active stake principal
 *    - Tiers: 1~500 NSN -> 1pt, 501~5000 -> 2pt, >=5001 -> 3pt
 *    - Lookback 2 days for PM2 downtime
 *
 * 4. Staking Emissions: LOG2-scaled delta of estimatedReward per day
 *    - "Yesterday's confirmed reward" approach: today's reading minus yesterday's
 *      stored value, attributed to YESTERDAY for week-boundary accuracy
 *    - Cold start: first run saves baseline only (no points awarded)
 *    - hasPartialFailure: skip entirely to prevent inflated delta next cycle
 *
 * Fully isolated: errors here never affect the main scan loop.
 */

import { pointsDb } from '../db.js';
import { rpcCall } from '../rpc.js';
import type { NftActivation } from '../config/ecosystem.js';
import {
  STAKING_V2_CUTOFF_DATE,
  calcStakingTierPts,
  STAKING_EMISSION_COEFF,
  STAKING_EMISSION_CUTOFF_DATE,
} from '../config/points.js';
import { EXCLUDED_CATEGORIES } from '../config/excluded-categories.js';
import {
  updateHealthForAllNftHolders,
  getHealthWatermark,
  addDays,
  maxDate,
} from './health-update.js';

export async function runDailyNftChecks(
  activationsCache: Map<string, NftActivation[]>,
  identityToWallet: Map<string, string>,
  registeredWallets: Map<string, string>,
): Promise<{ totalInserts: number; stakingRetryNeeded: boolean }> {
  if (!pointsDb) return { totalInserts: 0, stakingRetryNeeded: false };

  const genesisIds: string[] = [];
  for (const [identityId, activations] of activationsCache) {
    if (activations.some(a => a.nftType === 'genesis-pass')) {
      genesisIds.push(identityId);
    }
  }

  let passiveAwarded = 0;

  // Yesterday (UTC): date string for health catch-up target
  const nowUtc = new Date();
  const yesterdayDate = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate() - 1));
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

  // V3 NFT health catch-up. Watermark-based; idempotent across restarts.
  try {
    const watermark = await getHealthWatermark();
    const catchupStart = watermark
      ? maxDate(addDays(yesterdayStr, -6), addDays(watermark, 1))
      : yesterdayStr;

    let allianceUpdated = 0, allianceSkipped = 0;
    const days: string[] = [];
    for (let d = catchupStart; d <= yesterdayStr; d = addDays(d, 1)) {
      days.push(d);
      const result = await updateHealthForAllNftHolders(activationsCache, d);
      allianceUpdated += result.updated;
      allianceSkipped += result.skipped;
    }
    if (days.length > 0) {
      console.log(
        `[DailyNftCheck] Health catchup: days=[${days.join(',')}] ` +
        `updated=${allianceUpdated} skipped=${allianceSkipped}`,
      );
    }
  } catch (err) {
    console.error('[DailyNftCheck] Health update error (non-fatal):', err);
  }

  // --- Genesis Passive Points ---
  if (genesisIds.length > 0) {
    passiveAwarded = await awardGenesisPassivePoints(genesisIds, identityToWallet);
  }

  // --- Staking Daily + Emissions (single RPC fetch shared) ---
  let stakingAwarded = 0;
  let emissionsAwarded = 0;
  let stakingRetryNeeded = false;
  try {
    // Use staking-daily within last 3 days as the active-stake proxy.
    // This is equivalent to the old "has ever delegated" query but scoped
    // to users who are currently active, reducing RPC calls from O(all-time) to
    // O(active), which is ~3-5x smaller and avoids scanLoop timeout.
    const stakingUsers = await pointsDb!`
      SELECT DISTINCT identity_id FROM activity_points
      WHERE category = 'staking-daily' AND NOT flagged
        AND tx_timestamp >= CURRENT_DATE - 2
    `;
    const stakingIdentityIds = new Set(stakingUsers.map((r: any) => r.identity_id as string));

    if (stakingIdentityIds.size > 0) {
      const stakeDataByIdentity = await fetchIdentityStakeData(registeredWallets, stakingIdentityIds);
      const stakingRes = await awardStakingDailyPoints(stakeDataByIdentity);
      stakingAwarded = stakingRes.awarded;
      // If any identity got skipped due to RPC partial failure on today's
      // daysAgo=0 pass, ask the caller to keep the daily gate open so the
      // next scan cycle re-fetches stakes (ON CONFLICT DO NOTHING is safe).
      if (stakingRes.todayPartialFailures > 0) {
        stakingRetryNeeded = true;
        console.warn(
          `[DailyNftCheck] staking-daily partial-failure today: ${stakingRes.todayPartialFailures} identities deferred for retry`,
        );
      }
      emissionsAwarded = await awardStakingEmissions(stakeDataByIdentity);
    }
  } catch (err) {
    console.error('[DailyNftCheck] Staking points error (non-fatal):', err);
  }

  const totalInserts = passiveAwarded + stakingAwarded + emissionsAwarded;

  if (totalInserts > 0) {
    console.log(
      `[DailyNftCheck] passive: ${passiveAwarded} staking: ${stakingAwarded} emissions: ${emissionsAwarded}`,
    );
  }

  return { totalInserts, stakingRetryNeeded };
}

// --- Genesis Passive Points ---

async function awardGenesisPassivePoints(
  genesisIds: string[],
  identityToWallet: Map<string, string>,
): Promise<number> {

  let totalAwarded = 0;
  const now = new Date();

  // Lookback 2 days (yesterday + day before) to handle PM2 downtime
  for (let daysAgo = 1; daysAgo <= 2; daysAgo++) {
    const targetDate = new Date(now);
    targetDate.setUTCDate(targetDate.getUTCDate() - daysAgo);
    const dateStr = targetDate.toISOString().slice(0, 10);

    // Batch query: which genesis users had real activity on target day
    const activeRows = await pointsDb!`
      SELECT identity_id FROM activity_points
      WHERE identity_id = ANY(${genesisIds}) AND NOT flagged
        AND tx_timestamp >= ${dateStr}::date
        AND tx_timestamp < (${dateStr}::date + interval '1 day')
        AND category NOT IN ${pointsDb!(EXCLUDED_CATEGORIES)}
      GROUP BY identity_id
    `;

    const activeSet = new Set(activeRows.map(r => r.identity_id as string));

    // Insert passive points for inactive genesis holders
    for (const identityId of genesisIds) {
      if (activeSet.has(identityId)) continue;

      const wallet = identityToWallet.get(identityId);
      if (!wallet) continue;

      const digest = `pp:${identityId}:${dateStr}`;
      const txTimestamp = `${dateStr}T00:00:00Z`;

      const result = await pointsDb!`
        INSERT INTO activity_points
          (wallet_address, identity_id, tx_digest, category, activity_type,
           base_points, volume_tier, genesis_multiplier, final_points,
           tx_timestamp, event_seq, tx_sequence_number)
        VALUES
          (${wallet}, ${identityId}, ${digest}, 'ecosystem-passive', 'genesis-daily',
           1, 1.0, 1.0, ${'1.00'},
           ${txTimestamp}::timestamptz, 0, 0)
        ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
      `;
      if (result.count > 0) totalAwarded++;
    }
  }

  return totalAwarded;
}

// --- Shared RPC helper ---

interface StakeInfo {
  stakes: Array<{
    status: string;
    principal: string;
    estimatedReward?: string; // MIST, present when status='Active'
  }>;
}

interface IdentityStakeData {
  wallets: string[];
  totalPrincipalMist: bigint;
  totalEstimatedRewardMist: bigint;
  hasPartialFailure: boolean; // true if any wallet RPC failed
}

const MIST_PER_NSN = 10n ** 9n;

const RPC_CONCURRENCY = 50; // max parallel suix_getStakes calls

/**
 * Fetch suix_getStakes for all staking identities with bounded concurrency.
 * Both awardStakingDailyPoints and awardStakingEmissions share this result
 * to halve the total number of RPC calls.
 *
 * Concurrency is capped at RPC_CONCURRENCY to avoid overwhelming the RPC node
 * and hitting scanLoop's 180s timeout.
 */
async function fetchIdentityStakeData(
  registeredWallets: Map<string, string>,
  stakingIdentityIds: Set<string>,
): Promise<Map<string, IdentityStakeData>> {
  const identityToAllWallets = new Map<string, string[]>();
  for (const [addr, id] of registeredWallets) {
    if (!stakingIdentityIds.has(id)) continue;
    const list = identityToAllWallets.get(id);
    if (list) list.push(addr);
    else identityToAllWallets.set(id, [addr]);
  }

  const result = new Map<string, IdentityStakeData>();
  const entries = [...identityToAllWallets.entries()];

  // Process in batches of RPC_CONCURRENCY identities in parallel
  for (let i = 0; i < entries.length; i += RPC_CONCURRENCY) {
    const batch = entries.slice(i, i + RPC_CONCURRENCY);

    await Promise.all(batch.map(async ([identityId, wallets]) => {
      // Per-wallet RPC fetch with one retry + backoff. Fullnode 5xx/timeout
      // bursts (5/8 incident) marked entire identities as partial-failure on
      // first attempt, blocking the same-day staking-daily insert. Retrying
      // the failed wallets recovers most cases without inflating concurrency.
      const fetchOne = async (w: string): Promise<StakeInfo[]> => {
        try {
          return await rpcCall<StakeInfo[]>('suix_getStakes', [w]);
        } catch {
          await new Promise((r) => setTimeout(r, 750));
          return rpcCall<StakeInfo[]>('suix_getStakes', [w]);
        }
      };
      const stakeResults = await Promise.allSettled(wallets.map(fetchOne));

      let totalPrincipalMist = 0n;
      let totalEstimatedRewardMist = 0n;
      let hasPartialFailure = false;

      for (const r of stakeResults) {
        if (r.status !== 'fulfilled') {
          hasPartialFailure = true;
          continue;
        }
        for (const v of r.value) {
          for (const s of v.stakes ?? []) {
            if (s.status !== 'Active') continue;
            totalPrincipalMist += BigInt(String(s.principal));
            if (s.estimatedReward) {
              totalEstimatedRewardMist += BigInt(String(s.estimatedReward));
            }
          }
        }
      }

      result.set(identityId, {
        wallets,
        totalPrincipalMist,
        totalEstimatedRewardMist,
        hasPartialFailure,
      });
    }));
  }

  return result;
}

// --- Staking Daily Points (v2) ---

/**
 * Award tier-based staking-daily points per user per day, aggregating across
 * all wallets registered to the identity.
 *
 * Tiers: 1~500 NSN -> 1pt, 501~5,000 -> 2pt, >=5,001 -> 3pt.
 *
 * Pre-cutoff dates are skipped (v1 semantics frozen; forward-only).
 * Lookback 2 days for PM2 downtime recovery.
 */
async function awardStakingDailyPoints(
  stakeDataByIdentity: Map<string, IdentityStakeData>,
): Promise<{ awarded: number; todayPartialFailures: number }> {
  if (!pointsDb || stakeDataByIdentity.size === 0) {
    return { awarded: 0, todayPartialFailures: 0 };
  }

  const now = new Date();
  let totalAwarded = 0;
  let todayPartialFailures = 0;
  const todayStr = now.toISOString().slice(0, 10);

  // daysAgo=0 keeps `daily.stakingScore` populated within one scan cycle.
  // ON CONFLICT DO NOTHING locks today's tier at first sight (monotonic per-day).
  // 1,2 stays for PM2 downtime recovery.
  for (let daysAgo = 0; daysAgo <= 2; daysAgo++) {
    const targetDate = new Date(now);
    targetDate.setUTCDate(targetDate.getUTCDate() - daysAgo);
    const dateStr = targetDate.toISOString().slice(0, 10);

    if (dateStr < STAKING_V2_CUTOFF_DATE) continue;

    for (const [identityId, data] of stakeDataByIdentity) {
      const { wallets, totalPrincipalMist, hasPartialFailure } = data;
      if (wallets.length === 0) continue;
      if (hasPartialFailure) {
        // partial data -> skip to avoid under-crediting. Track today's misses
        // so the caller can defer the daily-gate close and retry next cycle.
        if (dateStr === todayStr) todayPartialFailures++;
        continue;
      }

      const digest = `stk:${identityId}:${dateStr}`;

      try {
        if (totalPrincipalMist === 0n) continue;

        const totalNsn = Number(totalPrincipalMist / MIST_PER_NSN);
        const pts = calcStakingTierPts(totalNsn);
        if (pts === 0) continue;

        const primaryWallet = wallets[0];
        const txTimestamp = `${dateStr}T00:00:00Z`;
        const result = await pointsDb`
          INSERT INTO activity_points
            (wallet_address, identity_id, tx_digest, category, activity_type,
             base_points, volume_tier, genesis_multiplier, final_points,
             tx_timestamp, event_seq, tx_sequence_number)
          VALUES
            (${primaryWallet}, ${identityId}, ${digest}, 'staking-daily', 'staking-active',
             ${pts}, 1.0, 1.0, ${pts.toFixed(2)},
             ${txTimestamp}::timestamptz, 0, 0)
          ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
        `;
        if (result.count > 0) totalAwarded++;
      } catch {
        // Skip user on error (non-fatal)
      }
    }
  }

  return { awarded: totalAwarded, todayPartialFailures };
}

// --- Staking Emissions (staking-reward) ---

/**
 * Award LOG2-scaled staking emission points per identity per day.
 *
 * "Yesterday's confirmed reward" approach:
 *   - Read today's estimatedReward (confirmed epochs + negligible current-epoch estimate)
 *   - delta = today's value - yesterday's stored value
 *   - Record with tx_timestamp = YESTERDAY for correct week-boundary attribution
 *
 * Cold start: first run saves baseline only; awards nothing to avoid crediting
 * all historical accumulated rewards at once.
 *
 * hasPartialFailure: state is updated with partial data (prevents delta
 * accumulation), but no points are awarded for that day.
 */
async function awardStakingEmissions(
  stakeDataByIdentity: Map<string, IdentityStakeData>,
): Promise<number> {
  if (!pointsDb || stakeDataByIdentity.size === 0) {
    console.log(`[DailyNftCheck] awardStakingEmissions early return: size=${stakeDataByIdentity.size}`);
    return 0;
  }

  const now = new Date();
  const yesterdayDate = new Date(now);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

  console.log(`[DailyNftCheck] awardStakingEmissions: size=${stakeDataByIdentity.size} yesterday=${yesterdayStr} cutoff=${STAKING_EMISSION_CUTOFF_DATE}`);

  // Forward-only guard: attribute to yesterday's date.
  if (yesterdayStr < STAKING_EMISSION_CUTOFF_DATE) {
    console.log('[DailyNftCheck] awardStakingEmissions: cutoff guard triggered, returning 0');
    return 0;
  }

  // Batch load previous state (single query)
  const identityIds = [...stakeDataByIdentity.keys()];
  const stateRows = await pointsDb`
    SELECT identity_id, last_total_mist
    FROM staking_emission_state
    WHERE identity_id = ANY(${identityIds}::text[])
  `;
  const prevStateMap = new Map<string, bigint>();
  for (const row of stateRows) {
    prevStateMap.set(row.identity_id as string, BigInt(String(row.last_total_mist)));
  }

  // Bulk UPSERT all state in a single query (eliminates N+1 for 15k+ users/day).
  // Always update even on partial failure — prevents multi-day delta accumulation
  // on next successful run.
  const stateIds: string[] = [];
  const stateMists: string[] = [];
  for (const [identityId, data] of stakeDataByIdentity) {
    stateIds.push(identityId);
    stateMists.push(String(data.totalEstimatedRewardMist));
  }
  if (stateIds.length > 0) {
    await pointsDb`
      INSERT INTO staking_emission_state (identity_id, last_total_mist, updated_at)
      SELECT unnest(${stateIds}::text[]), unnest(${stateMists}::numeric[]), NOW()
      ON CONFLICT (identity_id) DO UPDATE
        SET last_total_mist = EXCLUDED.last_total_mist, updated_at = NOW()
    `;
  }

  let totalAwarded = 0;

  for (const [identityId, data] of stakeDataByIdentity) {
    const { wallets, totalEstimatedRewardMist, hasPartialFailure } = data;

    // Partial RPC failure: skip award to avoid crediting incomplete data.
    if (hasPartialFailure) continue;

    // Cold start: no previous state -> save baseline only, award nothing.
    if (!prevStateMap.has(identityId)) continue;

    if (totalEstimatedRewardMist === 0n) continue; // no active stakes

    const prevMist = prevStateMap.get(identityId)!;
    const deltaMist = totalEstimatedRewardMist - prevMist;

    if (deltaMist <= 0n) continue; // unstake or epoch boundary reset

    // Number() loses precision beyond 2^53-1 (~9e15). Daily delta for even a
    // 10,000 NSN stake is ~8e8 MIST/day — well within safe integer range.
    const logScore = STAKING_EMISSION_COEFF * Math.log2(Number(deltaMist) + 1);
    const primaryWallet = wallets[0];
    const txDigest = `stkr:${identityId}:${yesterdayStr}`;

    try {
      const result = await pointsDb`
        INSERT INTO activity_points
          (wallet_address, identity_id, tx_digest, category, activity_type,
           base_points, volume_tier, genesis_multiplier, final_points,
           tx_timestamp, event_seq, tx_sequence_number, metadata)
        VALUES
          (${primaryWallet}, ${identityId}, ${txDigest},
           'staking-reward', 'emission-delta',
           1.0, 1.0, 1.0, ${logScore.toFixed(6)},
           ${`${yesterdayStr}T00:00:00Z`}::timestamptz, 0, 0,
           ${JSON.stringify({ emission_mist: String(deltaMist) })}::jsonb)
        ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
      `;
      if (result.count > 0) totalAwarded++;
    } catch (err) {
      console.error(`[DailyNftCheck] staking emission insert error for ${identityId}:`, err);
    }
  }

  return totalAwarded;
}
