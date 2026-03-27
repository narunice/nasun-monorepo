/**
 * Daily Mission Bonus Calculator
 *
 * Runs once per scanLoop() (after the batch while-loop completes).
 * Awards bonus points for first-of-day activities in qualifying categories.
 *
 * Design:
 * - Aggregate query: finds distinct categories per wallet for today (UTC)
 * - Inserts synthetic bonus rows for each qualifying mission
 * - All-clear bonus awarded when all 3 missions are completed
 * - Fully isolated: errors here never affect the main scan loop
 * - tx_digest format: dm:{walletAddress}:{YYYY-MM-DD}:{missionType}
 * - Idempotency: UNIQUE(tx_digest, activity_type, event_seq) + ON CONFLICT DO NOTHING
 */

import { pointsDb } from '../db.js';
import { BASE_POINTS } from '../config/points.js';

// Mission category -> daily mission activity type
const MISSION_MAP: Record<string, string> = {
  'pado-dex': 'dex-first',
  'pado-lottery': 'lottery-first',
  'governance': 'governance-first',
};

const QUALIFYING_CATEGORIES = Object.keys(MISSION_MAP);

/**
 * Calculate and insert daily mission bonus points.
 * Called once per scanLoop when totalProcessed > 0.
 */
export async function calculateDailyMissions(): Promise<number> {
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
  const dmPoints = BASE_POINTS['daily-mission'];

  for (const row of rows) {
    const wallet = row.wallet_address as string;
    const categories = row.categories as string[];

    // Award per-category mission bonus
    for (const [cat, missionType] of Object.entries(MISSION_MAP)) {
      if (!categories.includes(cat)) continue;

      const digest = `dm:${wallet}:${today}:${missionType}`;
      const pts = dmPoints[missionType];

      const result = await pointsDb`
        INSERT INTO activity_points
          (wallet_address, tx_digest, category, activity_type,
           base_points, volume_tier, genesis_multiplier, final_points,
           tx_timestamp, event_seq, tx_sequence_number)
        VALUES
          (${wallet}, ${digest}, 'daily-mission', ${missionType},
           ${pts}, 1.0, 1.0, ${String(pts)},
           NOW(), 0, 0)
        ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
      `;
      if (result.count > 0) inserted++;
    }

    // All-clear bonus (all 3 missions complete)
    if (QUALIFYING_CATEGORIES.every(cat => categories.includes(cat))) {
      const digest = `dm:${wallet}:${today}:all-clear`;
      const pts = dmPoints['all-clear'];

      const result = await pointsDb`
        INSERT INTO activity_points
          (wallet_address, tx_digest, category, activity_type,
           base_points, volume_tier, genesis_multiplier, final_points,
           tx_timestamp, event_seq, tx_sequence_number)
        VALUES
          (${wallet}, ${digest}, 'daily-mission', 'all-clear',
           ${pts}, 1.0, 1.0, ${String(pts)},
           NOW(), 0, 0)
        ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
      `;
      if (result.count > 0) inserted++;
    }
  }

  return inserted;
}
