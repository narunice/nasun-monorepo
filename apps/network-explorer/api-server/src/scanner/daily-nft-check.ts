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
import type { NftActivation } from '../config/ecosystem.js';

// Categories excluded from "real activity" checks
const EXCLUDED_CATEGORIES = [
  'referral-bonus',
  'daily-mission',
  'wallet-transfer',
  'ecosystem-passive',
  'ecosystem-bonus-pnl',
  'ecosystem-bonus-rank',
  'ecosystem-bonus-game',
  'ecosystem-bonus-diversity',
];

export async function runDailyNftChecks(
  activationsCache: Map<string, NftActivation[]>,
  identityToWallet: Map<string, string>,
): Promise<void> {
  if (!pointsDb) return;

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

  if (penaltiesApplied > 0 || penaltiesRecovered > 0 || passiveAwarded > 0) {
    console.log(
      `[DailyNftCheck] penalties: ${penaltiesApplied} applied, ${penaltiesRecovered} recovered, ${passiveAwarded} passive awarded`,
    );
  }
}

// --- Alliance Penalty ---

async function checkAlliancePenalties(
  allianceOnlyIds: string[],
): Promise<{ applied: number; recovered: number }> {
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
        INSERT INTO alliance_penalties (identity_id, penalty_start)
        VALUES (${id}, ${today}::date)
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
