/**
 * Daily Ecosystem Score Snapshot
 *
 * Takes an immutable snapshot of all users' ecosystem scores at end of day.
 * Formula: ecosystem_score = (base_score x multiplier) + bonus_total
 *
 * Called once per day from scanLoop, after matview refresh.
 * Idempotent via ON CONFLICT DO NOTHING on (identity_id, snapshot_date).
 */

import { pointsDb } from '../db.js';
import { calculateMultiplier, type NftActivation } from '../config/ecosystem.js';

export async function takeDailySnapshot(
  snapshotDate: string,
  activationsCache: Map<string, NftActivation[]>,
): Promise<void> {
  if (!pointsDb) return;

  // Skip if snapshot already exists for this date
  const [existing] = await pointsDb`
    SELECT 1 FROM ecosystem_score_snapshots
    WHERE snapshot_date = ${snapshotDate}::date LIMIT 1
  `;
  if (existing) {
    console.log(`[Snapshot] Already exists for ${snapshotDate}, skipping`);
    return;
  }

  // 1. Get all users' base_score for the snapshot date from matview
  const baseScores = await pointsDb`
    SELECT identity_id, base_score::int as base_score
    FROM ecosystem_daily_scores
    WHERE day = ${snapshotDate}::date
  `;

  // 2. Collect all identity IDs (union of matview + activationsCache)
  const allIds = new Set<string>();
  for (const row of baseScores) allIds.add(row.identity_id as string);
  for (const id of activationsCache.keys()) allIds.add(id);

  if (allIds.size === 0) {
    console.log(`[Snapshot] No users to snapshot for ${snapshotDate}`);
    return;
  }

  // 3. Build base_score map
  const baseMap = new Map<string, number>();
  for (const row of baseScores) {
    baseMap.set(row.identity_id as string, row.base_score as number);
  }

  // 4. Batch penalty check
  const allIdsArr = [...allIds];
  const penalizedRows = await pointsDb`
    SELECT identity_id FROM alliance_penalties
    WHERE identity_id = ANY(${allIdsArr})
  `;
  const penalizedSet = new Set(penalizedRows.map(r => r.identity_id as string));

  // 5. Batch bonus query
  const bonusRows = await pointsDb`
    SELECT identity_id, COALESCE(SUM(final_points), 0)::numeric as bonus
    FROM activity_points
    WHERE identity_id = ANY(${allIdsArr})
      AND category LIKE 'ecosystem-bonus-%'
      AND NOT flagged
    GROUP BY identity_id
  `;
  const bonusMap = new Map<string, number>();
  for (const br of bonusRows) {
    bonusMap.set(br.identity_id as string, parseFloat(br.bonus as string));
  }

  // 6. Calculate scores and rank
  interface SnapshotRow {
    identityId: string;
    baseScore: number;
    multiplier: number;
    bonusTotal: number;
    ecosystemScore: number;
    isPenalized: boolean;
  }

  const entries: SnapshotRow[] = [];

  for (const identityId of allIds) {
    const baseScore = baseMap.get(identityId) ?? 0;
    let activations = activationsCache.get(identityId) ?? [];
    const isPenalized = penalizedSet.has(identityId);

    if (isPenalized) {
      activations = activations.filter(a => a.nftType !== 'alliance');
    }

    const multiplier = calculateMultiplier(activations);
    const bonusTotal = bonusMap.get(identityId) ?? 0;
    const ecosystemScore = parseFloat((baseScore * multiplier + bonusTotal).toFixed(2));

    entries.push({ identityId, baseScore, multiplier, bonusTotal, ecosystemScore, isPenalized });
  }

  // Sort by ecosystemScore DESC, assign ranks (multiplier > 0 only)
  entries.sort((a, b) => b.ecosystemScore - a.ecosystemScore);
  let rank = 0;
  for (const e of entries) {
    if (e.multiplier > 0) {
      rank++;
      (e as SnapshotRow & { rank?: number }).rank = rank;
    }
  }

  // 7. Batch INSERT
  let inserted = 0;
  for (const e of entries) {
    const r = (e as SnapshotRow & { rank?: number }).rank ?? null;
    const result = await pointsDb`
      INSERT INTO ecosystem_score_snapshots
        (identity_id, snapshot_date, base_score, multiplier, bonus_total,
         ecosystem_score, is_penalized, rank)
      VALUES
        (${e.identityId}, ${snapshotDate}::date, ${e.baseScore},
         ${e.multiplier.toFixed(2)}, ${e.bonusTotal.toFixed(2)},
         ${e.ecosystemScore.toFixed(2)}, ${e.isPenalized}, ${r})
      ON CONFLICT (identity_id, snapshot_date) DO NOTHING
    `;
    if (result.count > 0) inserted++;
  }

  console.log(`[Snapshot] ${inserted} users snapshotted for ${snapshotDate}`);
}
