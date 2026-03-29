/**
 * Daily Mission Bonus Calculator
 *
 * Runs once per scanLoop() (after the batch while-loop completes).
 * Awards bonus points for first-of-day activities in qualifying categories.
 *
 * Design:
 * - Aggregate query: finds distinct categories per wallet for today (UTC)
 * - Inserts synthetic bonus rows for each qualifying mission
 * - Tiered bonus: 4/6 (+5), 5/6 (+10), 6/6 all-clear (+20)
 * - Fully isolated: errors here never affect the main scan loop
 * - tx_digest format: dm:{walletAddress}:{YYYY-MM-DD}:{missionType}
 * - Idempotency: UNIQUE(tx_digest, activity_type, event_seq) + ON CONFLICT DO NOTHING
 */

import { pointsDb } from '../db.js';
import { BASE_POINTS } from '../config/points.js';

// Mission category -> daily mission type + points
const MISSION_MAP: Record<string, { missionType: string; points: number }> = {
  'pado-dex':         { missionType: 'dex-first', points: 10 },
  'pado-lottery':     { missionType: 'lottery-first', points: 10 },
  'governance':       { missionType: 'governance-first', points: 20 },
  'pado-perp':        { missionType: 'perp-first', points: 10 },
  'pado-scratchcard': { missionType: 'scratchcard-first', points: 10 },
  'baram-ai':         { missionType: 'baram-first', points: 12 },
};

const QUALIFYING_CATEGORIES = Object.keys(MISSION_MAP);
const TOTAL_MISSIONS = QUALIFYING_CATEGORIES.length; // 6

// Tiered bonus thresholds
const TIER_BONUSES: { threshold: number; missionType: string; points: number }[] = [
  { threshold: 4, missionType: 'tier-4', points: 5 },
  { threshold: 5, missionType: 'tier-5', points: 10 },
  { threshold: 6, missionType: 'all-clear', points: 20 },
];

/**
 * Calculate and insert daily mission bonus points.
 * Called once per scanLoop when totalProcessed > 0.
 *
 * @param walletMap - Map<walletAddress, identityId> from registeredWallets
 */
export async function calculateDailyMissions(
  walletMap: Map<string, string>,
): Promise<number> {
  if (!pointsDb) return 0;

  const today = new Date().toISOString().slice(0, 10); // UTC date

  // Find all wallets with qualifying activity today
  const rows = await pointsDb`
    SELECT wallet_address, array_agg(DISTINCT category) as categories
    FROM activity_points
    WHERE NOT flagged
      AND tx_timestamp >= ${today}::date
      AND tx_timestamp < (${today}::date + interval '1 day')
      AND category IN ${pointsDb(QUALIFYING_CATEGORIES)}
    GROUP BY wallet_address
  `;

  if (rows.length === 0) return 0;

  let inserted = 0;

  for (const row of rows) {
    const wallet = row.wallet_address as string;
    const categories = row.categories as string[];
    const identityId = walletMap.get(wallet.toLowerCase()) ?? null;

    // Award per-category mission bonus
    for (const [cat, mission] of Object.entries(MISSION_MAP)) {
      if (!categories.includes(cat)) continue;

      const digest = `dm:${wallet}:${today}:${mission.missionType}`;

      const result = await pointsDb`
        INSERT INTO activity_points
          (wallet_address, identity_id, tx_digest, category, activity_type,
           base_points, volume_tier, genesis_multiplier, final_points,
           tx_timestamp, event_seq, tx_sequence_number)
        VALUES
          (${wallet}, ${identityId}, ${digest}, 'daily-mission', ${mission.missionType},
           ${mission.points}, 1.0, 1.0, ${String(mission.points)},
           NOW(), 0, 0)
        ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
      `;
      if (result.count > 0) inserted++;
    }

    // Tiered bonus: award each tier the wallet qualifies for
    const completedCount = QUALIFYING_CATEGORIES.filter(cat => categories.includes(cat)).length;
    for (const tier of TIER_BONUSES) {
      if (completedCount < tier.threshold) continue;

      const digest = `dm:${wallet}:${today}:${tier.missionType}`;

      const result = await pointsDb`
        INSERT INTO activity_points
          (wallet_address, identity_id, tx_digest, category, activity_type,
           base_points, volume_tier, genesis_multiplier, final_points,
           tx_timestamp, event_seq, tx_sequence_number)
        VALUES
          (${wallet}, ${identityId}, ${digest}, 'daily-mission', ${tier.missionType},
           ${tier.points}, 1.0, 1.0, ${String(tier.points)},
           NOW(), 0, 0)
        ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
      `;
      if (result.count > 0) inserted++;
    }
  }

  return inserted;
}
