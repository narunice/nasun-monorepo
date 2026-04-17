/**
 * Daily NFT Check: Alliance Penalty + Genesis Passive Points
 *
 * Runs once per day from scanLoop (after daily missions).
 * Combines two features into a single activationsCache traversal:
 *
 * 1. Alliance Penalty: deactivate alliance bonus for users with <=5 active days in 7
 *    - Exempt if user also has genesis-pass
 *    - Recovery: 2 consecutive active days -> remove penalty
 *
 * 2. Genesis Passive: award 1 passive point per inactive day for genesis holders
 *    - Lookback 2 days to handle PM2 downtime
 *    - Idempotent via tx_digest: pp:{identityId}:{date}
 *
 * Fully isolated: errors here never affect the main scan loop.
 */

import { pointsDb } from '../db.js';
import { rpcCall } from '../rpc.js';
import type { NftActivation } from '../config/ecosystem.js';
import {
  STAKING_V2_CUTOFF_DATE,
  calcStakingTierPts,
} from '../config/points.js';

// Categories excluded from "real activity" checks
const EXCLUDED_CATEGORIES = [
  'referral-bonus',
  'daily-mission',
  'ecosystem-passive',
  'staking-daily',
  'ecosystem-bonus-pnl',
  'ecosystem-bonus-rank',
  'ecosystem-bonus-game',
  'ecosystem-bonus-diversity',
  'ecosystem-bonus-admin',
  'ecosystem-bonus-bugreport',
  'ecosystem-bonus-feedback',
  'ecosystem-bonus-restoration',
];

export async function runDailyNftChecks(
  activationsCache: Map<string, NftActivation[]>,
  identityToWallet: Map<string, string>,
  registeredWallets: Map<string, string>,
): Promise<number> {
  if (!pointsDb) return 0;

  // Partition users by NFT type in a single traversal
  const allianceOnlyIds: string[] = [];
  const genesisIds: string[] = [];

  for (const [identityId, activations] of activationsCache) {
    const hasAlliance = activations.some(a => a.nftType === 'alliance');
    const hasGenesis = activations.some(a => a.nftType === 'genesis-pass');

    if (hasGenesis) {
      genesisIds.push(identityId);
    }
    if (hasAlliance && !hasGenesis) {
      allianceOnlyIds.push(identityId);
    }
  }

  let penaltiesApplied = 0;
  let penaltiesRecovered = 0;
  let passiveAwarded = 0;

  // --- Alliance Penalty Check ---
  if (allianceOnlyIds.length > 0) {
    const result = await checkAlliancePenalties(allianceOnlyIds);
    penaltiesApplied = result.applied;
    penaltiesRecovered = result.recovered;
  }

  // --- Genesis Passive Points ---
  if (genesisIds.length > 0) {
    passiveAwarded = await awardGenesisPassivePoints(genesisIds, identityToWallet);
  }

  // --- Staking Daily Points (v2) ---
  let stakingAwarded = 0;
  try {
    stakingAwarded = await awardStakingDailyPoints(registeredWallets);
  } catch (err) {
    console.error('[DailyNftCheck] Staking daily points error (non-fatal):', err);
  }

  // Wallet-transfer detection has moved to wallet-transfer-scanner.ts
  // (indexer SQL based). Cursor-lag in that scanner naturally absorbs PM2
  // downtime gaps, so no separate catch-up call is needed here.

  const totalInserts = passiveAwarded + stakingAwarded;

  if (penaltiesApplied > 0 || penaltiesRecovered > 0 || totalInserts > 0) {
    console.log(
      `[DailyNftCheck] penalties: ${penaltiesApplied} applied, ${penaltiesRecovered} recovered, ` +
      `${passiveAwarded} passive, ${stakingAwarded} staking`,
    );
  }

  return totalInserts;
}

// --- Alliance Penalty ---

async function checkAlliancePenalties(
  allianceOnlyIds: string[],
): Promise<{ applied: number; recovered: number }> {
  // Grace period: penalty enforcement starts after Genesis Pass activation opens.
  // Genesis Pass holders need a chance to activate for penalty immunity.
  // Genesis Pass activation: April 15th midnight -> enforce from April 16th.
  const PENALTY_ENFORCEMENT_START = '2026-04-16';
  if (new Date().toISOString().slice(0, 10) < PENALTY_ENFORCEMENT_START) {
    const cleared = await pointsDb!`DELETE FROM alliance_penalties`;
    if (cleared.count > 0) {
      console.log(`[DailyNftCheck] Grace period active, cleared ${cleared.count} penalties`);
    }
    return { applied: 0, recovered: 0 };
  }

  // Batch query: active days in last 7 for all alliance-only users
  const activityRows = await pointsDb!`
    SELECT identity_id, COUNT(DISTINCT date_trunc('day', tx_timestamp)::date) as active_days
    FROM activity_points
    WHERE identity_id = ANY(${allianceOnlyIds}) AND NOT flagged
      AND tx_timestamp >= CURRENT_DATE - 6
      AND category NOT IN ${pointsDb!(EXCLUDED_CATEGORIES)}
    GROUP BY identity_id
  `;

  const activeDaysMap = new Map<string, number>();
  for (const row of activityRows) {
    activeDaysMap.set(row.identity_id as string, Number(row.active_days));
  }

  // Find users who should be penalized (<=5 active days, not already penalized)
  const shouldPenalize: string[] = [];
  for (const id of allianceOnlyIds) {
    const activeDays = activeDaysMap.get(id) ?? 0;
    if (activeDays <= 5) {
      shouldPenalize.push(id);
    }
  }

  let applied = 0;
  if (shouldPenalize.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    for (const id of shouldPenalize) {
      const result = await pointsDb!`
        INSERT INTO alliance_penalties (identity_id, penalty_start, first_seen)
        VALUES (${id}, ${today}::date, ${today}::date)
        ON CONFLICT (identity_id) DO NOTHING
      `;
      if (result.count > 0) applied++;
    }
  }

  // Recovery check: penalized users with 2 consecutive active days (yesterday + today)
  const penalizedRows = await pointsDb!`
    SELECT identity_id FROM alliance_penalties
  `;
  const penalizedIds = penalizedRows.map(r => r.identity_id as string);

  let recovered = 0;
  if (penalizedIds.length > 0) {
    const recoveredRows = await pointsDb!`
      SELECT identity_id FROM activity_points
      WHERE identity_id = ANY(${penalizedIds}) AND NOT flagged
        AND tx_timestamp >= CURRENT_DATE - 1
        AND category NOT IN ${pointsDb!(EXCLUDED_CATEGORIES)}
      GROUP BY identity_id
      HAVING COUNT(DISTINCT date_trunc('day', tx_timestamp)::date) >= 2
    `;

    const recoveredIds = recoveredRows.map(r => r.identity_id as string);
    if (recoveredIds.length > 0) {
      const delResult = await pointsDb!`
        DELETE FROM alliance_penalties
        WHERE identity_id = ANY(${recoveredIds})
      `;
      recovered = delResult.count;
    }
  }

  return { applied, recovered };
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

// --- Staking Daily Points (v2) ---

interface StakeInfo {
  stakes: Array<{ status: string; principal: string }>;
}

const MIST_PER_NSN = 10n ** 9n;

/**
 * Award tier-based staking-daily points per user per day, aggregating across
 * all wallets registered to the identity (suix_getStakes is Sui-native so
 * identity-level EVM cache cannot help here).
 *
 * Tiers: 1~500 NSN -> 1pt, 501~5,000 -> 2pt, >=5,001 -> 3pt.
 *
 * Pre-cutoff dates are skipped (v1 semantics frozen; forward-only).
 * Lookback 2 days for PM2 downtime recovery.
 */
async function awardStakingDailyPoints(
  registeredWallets: Map<string, string>,
): Promise<number> {
  if (!pointsDb || registeredWallets.size === 0) return 0;

  // Only check users who have ever staked (optimization)
  const stakingUsers = await pointsDb`
    SELECT DISTINCT identity_id FROM activity_points
    WHERE category = 'staking' AND activity_type = 'delegate' AND NOT flagged
  `;

  const stakingIdentityIds = new Set(stakingUsers.map(r => r.identity_id as string));
  if (stakingIdentityIds.size === 0) return 0;

  // Build identityId -> all Sui wallets map for multi-wallet aggregation.
  const identityToAllWallets = new Map<string, string[]>();
  for (const [addr, id] of registeredWallets) {
    if (!stakingIdentityIds.has(id)) continue;
    const list = identityToAllWallets.get(id);
    if (list) list.push(addr);
    else identityToAllWallets.set(id, [addr]);
  }

  const now = new Date();
  let totalAwarded = 0;

  // daysAgo=0 (today) keeps `daily.stakingScore` in the user-facing formula
  // populated within one scan cycle after delegation. ON CONFLICT DO NOTHING
  // locks today's tier at first sight (monotonic per-day; tier upgrades show
  // up tomorrow). 1,2 stays for PM2 downtime recovery.
  for (let daysAgo = 0; daysAgo <= 2; daysAgo++) {
    const targetDate = new Date(now);
    targetDate.setUTCDate(targetDate.getUTCDate() - daysAgo);
    const dateStr = targetDate.toISOString().slice(0, 10);

    // Scanner-side forward-only guard: pre-cutoff dates never get v2 rows.
    if (dateStr < STAKING_V2_CUTOFF_DATE) continue;

    for (const identityId of stakingIdentityIds) {
      const wallets = identityToAllWallets.get(identityId);
      if (!wallets || wallets.length === 0) continue;

      const digest = `stk:${identityId}:${dateStr}`;

      try {
        // allSettled: a single bad wallet RPC must not block the whole identity.
        // Partial sums are forward-only (monotonic) so fulfilled results alone
        // are safe to credit; rejected wallets simply contribute zero this cycle.
        const stakeResults = await Promise.allSettled(
          wallets.map((w) => rpcCall<StakeInfo[]>('suix_getStakes', [w])),
        );

        // Sum active principal across every wallet the identity owns.
        let totalMist = 0n;
        for (const r of stakeResults) {
          if (r.status !== 'fulfilled') continue;
          for (const v of r.value) {
            for (const s of v.stakes ?? []) {
              if (s.status !== 'Active') continue;
              totalMist += BigInt(String(s.principal));
            }
          }
        }
        if (totalMist === 0n) continue;

        // Integer division: tier boundaries are whole-NSN-safe (500/5000).
        const totalNsn = Number(totalMist / MIST_PER_NSN);
        const pts = calcStakingTierPts(totalNsn);
        if (pts === 0) continue;

        // Record row keyed on the identity's first wallet for activity_points.wallet_address.
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
        // Skip user on RPC error (non-fatal)
      }
    }
  }

  return totalAwarded;
}

