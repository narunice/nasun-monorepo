/**
 * Daily Ecosystem Score Snapshot
 *
 * Takes an immutable snapshot of all users' ecosystem scores at end of day.
 * Formula: ecosystem_score = base_score * multiplier + todayBonus + todayGov + todayRef * sf
 * (daily delta only, no compounding -- bonus/referral/governance use date-filtered queries)
 *
 * Called once per day from scanLoop, after matview refresh.
 * Idempotent via ON CONFLICT DO NOTHING on (identity_id, snapshot_date).
 */

import { pointsDb } from '../db.js';
import {
  calculateMultiplier,
  calculateMultiplierV2,
  isV2CutoverActive,
  type NftActivation,
  type NftHealth,
} from '../config/ecosystem.js';
import { REFERRAL_ECOSYSTEM_SCALING_FACTOR } from '../config/referral.js';
import { STAKING_V2_CUTOFF_DATE } from '../config/points.js';

// Historic 6 default missions applied to users who have never persisted a
// custom selection. Mirrors DEFAULT_MISSIONS_BY_APP in the frontend registry.
const DEFAULT_MISSION_IDS: ReadonlySet<string> = new Set([
  'faucet', 'wallet-transfer', 'pado-dex',
  'gostop-lottery', 'gostop-scratchcard', 'gostop-numbermatch',
]);
const PADO_DEX = 'pado-dex';

export async function takeDailySnapshot(
  snapshotDate: string,
  activationsCache: Map<string, NftActivation[]>,
): Promise<void> {
  if (!pointsDb) return;

  // 1. Load every user's active mission selection (full table — small).
  //    Users without a row get DEFAULT_MISSION_IDS applied at score-time.
  const userMissionsRows = await pointsDb`
    SELECT identity_id, missions FROM user_active_missions
  `;
  const userMissionsMap = new Map<string, ReadonlySet<string>>();
  for (const row of userMissionsRows) {
    userMissionsMap.set(
      row.identity_id as string,
      new Set(row.missions as string[]),
    );
  }

  // 2. Fetch all distinct (identity_id, category) pairs for the snapshot date.
  //    Range comparison keeps the query sargable on the tx_timestamp index.
  const rawCatRows = await pointsDb`
    SELECT DISTINCT identity_id, category
    FROM activity_points
    WHERE tx_timestamp >= ${snapshotDate}::date
      AND tx_timestamp <  (${snapshotDate}::date + interval '1 day')
      AND NOT flagged
      AND base_points > 0
      AND identity_id IS NOT NULL
      AND category NOT IN (
        'referral-bonus', 'daily-mission', 'ecosystem-passive',
        'staking-daily', 'staking'
      )
      AND category NOT LIKE 'ecosystem-bonus-%'
  `;

  // 3. Compute filtered base_score per user using their active mission set.
  //    An empty stored set (missions=[]) falls back to DEFAULT_MISSION_IDS so
  //    an attacker who PUTs [] cannot zero out a user's immutable snapshot score.
  const filteredBaseMap = new Map<string, number>();
  for (const row of rawCatRows) {
    const identityId = row.identity_id as string;
    const category = row.category as string;
    const stored = userMissionsMap.get(identityId);
    const activeMissions: ReadonlySet<string> =
      (stored && stored.size > 0) ? stored : DEFAULT_MISSION_IDS;
    if (!activeMissions.has(category)) continue;
    const weight = category === PADO_DEX ? 2 : 1;
    filteredBaseMap.set(identityId, (filteredBaseMap.get(identityId) ?? 0) + weight);
  }

  // 4. Collect all identity IDs (union of active-today + activationsCache)
  const allIds = new Set<string>();
  for (const id of filteredBaseMap.keys()) allIds.add(id);
  for (const id of activationsCache.keys()) allIds.add(id);

  if (allIds.size === 0) {
    console.log(`[Snapshot] No users to snapshot for ${snapshotDate}`);
    return;
  }

  // 5. Batch penalty/health check
  const allIdsArr = [...allIds];
  const isV2 = isV2CutoverActive(snapshotDate);

  // Alliance penalty branch removed (policy deprecated 2026-05-02). V1 path
  // now leaves penalizedSet empty -> is_penalized=false, no multiplier zeroing.
  const penalizedSet = new Set<string>();
  const healthMap = new Map<string, { alliance: number; gp: number }>();

  if (isV2) {
    // V2: load health state (<=snapshotDate for robustness against timing)
    const healthRows = await pointsDb`
      SELECT DISTINCT ON (identity_id, nft_type)
        identity_id, nft_type, health_pct
      FROM nft_health_state
      WHERE identity_id = ANY(${allIdsArr})
        AND last_evaluated_day <= ${snapshotDate}::date
      ORDER BY identity_id, nft_type, last_evaluated_day DESC
    `;
    for (const r of healthRows) {
      const entry = healthMap.get(r.identity_id as string) ?? { alliance: 100, gp: 100 };
      if (r.nft_type === 'alliance')     entry.alliance = parseFloat(r.health_pct as string);
      if (r.nft_type === 'genesis-pass') entry.gp       = parseFloat(r.health_pct as string);
      healthMap.set(r.identity_id as string, entry);
    }

    // Fail-safe: any active NFT holder with no health row -> bail, retry next cycle
    let missingCount = 0;
    for (const [id, acts] of activationsCache) {
      const hasNft = acts.some(a => a.status === 'ACTIVE' &&
        (a.nftType === 'alliance' || a.nftType === 'genesis-pass'));
      if (hasNft && !healthMap.has(id)) missingCount++;
    }
    if (missingCount > 0) {
      console.error(
        `[Snapshot] V2 health missing for ${missingCount} NFT holders on ${snapshotDate}. Skipping snapshot.`,
      );
      if (missingCount > 10) {
        console.error('[Snapshot] ALERT: >10 missing holders, investigate health-update.');
      }
      return;
    }
  }
  // V1 (pre-cutover): penalizedSet stays empty; no alliance_penalties read.

  // 6. Batch bonus + referral + governance queries (date-filtered: today's delta only).
  // bonusRows EXCLUDES synthetic rows (maintains the existing per-day column semantics).
  // bonusCumRows INCLUDES synthetic — needed for cumulative math to match LIVE.
  // stakingRows: tier pts from post-cutoff staking-daily (v2).
  const batchResults = await Promise.allSettled([
    pointsDb`
      SELECT identity_id, COALESCE(SUM(final_points), 0)::numeric as bonus
      FROM activity_points
      WHERE identity_id = ANY(${allIdsArr})
        AND category LIKE 'ecosystem-bonus-%'
        AND (metadata->>'synthetic') IS DISTINCT FROM 'true'
        AND NOT flagged
        AND tx_timestamp >= ${snapshotDate}::date
        AND tx_timestamp < (${snapshotDate}::date + interval '1 day')
      GROUP BY identity_id
    `,
    pointsDb`
      SELECT identity_id, COALESCE(SUM(final_points), 0)::numeric as bonus
      FROM activity_points
      WHERE identity_id = ANY(${allIdsArr})
        AND category LIKE 'ecosystem-bonus-%'
        AND NOT flagged
        AND tx_timestamp >= ${snapshotDate}::date
        AND tx_timestamp < (${snapshotDate}::date + interval '1 day')
      GROUP BY identity_id
    `,
    pointsDb`
      SELECT identity_id, COALESCE(SUM(final_points), 0)::numeric as referral
      FROM activity_points
      WHERE identity_id = ANY(${allIdsArr})
        AND category = 'referral-bonus'
        AND NOT flagged
        AND tx_timestamp >= ${snapshotDate}::date
        AND tx_timestamp < (${snapshotDate}::date + interval '1 day')
      GROUP BY identity_id
    `,
    pointsDb`
      SELECT identity_id, COALESCE(SUM(final_points), 0)::numeric as gov
      FROM activity_points
      WHERE identity_id = ANY(${allIdsArr})
        AND category = 'governance'
        AND NOT flagged
        AND tx_timestamp >= ${snapshotDate}::date
        AND tx_timestamp < (${snapshotDate}::date + interval '1 day')
      GROUP BY identity_id
    `,
    pointsDb`
      SELECT identity_id, COALESCE(SUM(base_points), 0)::int as staking
      FROM activity_points
      WHERE identity_id = ANY(${allIdsArr})
        AND category = 'staking-daily'
        AND NOT flagged
        AND tx_timestamp >= ${STAKING_V2_CUTOFF_DATE}::timestamptz
        AND tx_timestamp >= ${snapshotDate}::date
        AND tx_timestamp < (${snapshotDate}::date + interval '1 day')
      GROUP BY identity_id
    `,
  ]);
  const [bonusRes, bonusCumRes, referralRes, govRes, stakingRes] = batchResults;
  if (batchResults.some(r => r.status === 'rejected')) {
    const failed = batchResults
      .map((r, i) => r.status === 'rejected' ? `query[${i}]: ${(r as PromiseRejectedResult).reason}` : null)
      .filter(Boolean);
    console.error(`[Snapshot] Batch query partial failure for ${snapshotDate}:`, failed.join('; '));
  }
  const bonusRows = bonusRes.status === 'fulfilled' ? bonusRes.value : [];
  const bonusCumRows = bonusCumRes.status === 'fulfilled' ? bonusCumRes.value : [];
  const referralRows = referralRes.status === 'fulfilled' ? referralRes.value : [];
  const govRows = govRes.status === 'fulfilled' ? govRes.value : [];
  const stakingRows = stakingRes.status === 'fulfilled' ? stakingRes.value : [];
  const bonusMap = new Map<string, number>();
  for (const br of bonusRows) {
    bonusMap.set(br.identity_id as string, parseFloat(br.bonus as string));
  }
  const bonusCumMap = new Map<string, number>();
  for (const br of bonusCumRows) {
    bonusCumMap.set(br.identity_id as string, parseFloat(br.bonus as string));
  }
  const referralMap = new Map<string, number>();
  for (const rr of referralRows) {
    referralMap.set(rr.identity_id as string, parseFloat(rr.referral as string));
  }
  const govMap = new Map<string, number>();
  for (const gr of govRows) {
    govMap.set(gr.identity_id as string, parseFloat(gr.gov as string));
  }
  const stakingMap = new Map<string, number>();
  for (const sr of stakingRows) {
    stakingMap.set(sr.identity_id as string, sr.staking as number);
  }

  // 6b. Previous cumulative per identity (anchor propagation).
  // Uses the latest snapshot row that already has all_time_score filled
  // (bootstrap anchor or prior cumulative-enabled snapshot).
  // Users without a prev cumulative start fresh from 0 today.
  const prevCumRows = await pointsDb`
    SELECT DISTINCT ON (identity_id)
      identity_id,
      snapshot_date AS prev_date,
      COALESCE(all_time_score, 0)::numeric             AS prev_score,
      COALESCE(all_time_base, 0)::numeric              AS prev_base,
      COALESCE(all_time_bonus, 0)::numeric             AS prev_bonus,
      COALESCE(all_time_gov, 0)::numeric               AS prev_gov,
      COALESCE(all_time_referral_scaled, 0)::numeric   AS prev_ref,
      COALESCE(all_time_staking_scaled, 0)::numeric    AS prev_staking
    FROM ecosystem_score_snapshots
    WHERE identity_id = ANY(${allIdsArr})
      AND snapshot_date < ${snapshotDate}::date
      AND all_time_score IS NOT NULL
    ORDER BY identity_id, snapshot_date DESC
  `;
  // Keep raw numeric strings (not parseFloat) so SQL can do exact-precision
  // arithmetic during INSERT — avoids JS float drift on prev+delta accumulation.
  interface PrevCum {
    prevDate: string;
    baseStr: string;
    bonusStr: string;
    govStr: string;
    refStr: string;
    stakingStr: string;
  }
  const prevMap = new Map<string, PrevCum>();
  for (const r of prevCumRows) {
    prevMap.set(r.identity_id as string, {
      prevDate: r.prev_date as string,
      baseStr: r.prev_base as string,
      bonusStr: r.prev_bonus as string,
      govStr: r.prev_gov as string,
      refStr: r.prev_ref as string,
      stakingStr: r.prev_staking as string,
    });
  }

  // 7. Calculate scores and rank
  interface SnapshotRow {
    identityId: string;
    baseScore: number;
    multiplier: number;
    bonusTotal: number;
    bonusTotalInclSynthetic: number;
    referralBonus: number;
    governanceBonus: number;
    stakingDelta: number;
    ecosystemScore: number;
    isPenalized: boolean;
    isV2Row: boolean;
    allianceHealth: number | null;
    gpHealth: number | null;
    // Prev cumulative as raw numeric strings — passed to SQL for exact addition.
    prevBaseStr: string;
    prevBonusStr: string;
    prevGovStr: string;
    prevRefStr: string;
    prevStakingStr: string;
  }

  // Fallback multiplier: for users with base activity but not in activationsCache,
  // use their most recent snapshot's multiplier to prevent incorrect 0-multiplier snapshots.
  // V2: fallback from multiplier_v2; V1: fallback from multiplier.
  const cacheMissIds = allIdsArr.filter(
    id => filteredBaseMap.has(id) && !activationsCache.has(id),
  );
  const lastMultiplierMap = new Map<string, number>();
  if (cacheMissIds.length > 0) {
    const fallbackRows = isV2
      ? await pointsDb`
          SELECT DISTINCT ON (identity_id) identity_id,
            COALESCE(multiplier_v2, multiplier)::numeric as multiplier
          FROM ecosystem_score_snapshots
          WHERE identity_id = ANY(${cacheMissIds})
            AND COALESCE(multiplier_v2, multiplier) > 0
          ORDER BY identity_id, snapshot_date DESC
        `
      : await pointsDb`
          SELECT DISTINCT ON (identity_id) identity_id, multiplier::numeric as multiplier
          FROM ecosystem_score_snapshots
          WHERE identity_id = ANY(${cacheMissIds})
            AND multiplier > 0
          ORDER BY identity_id, snapshot_date DESC
        `;
    for (const row of fallbackRows) {
      lastMultiplierMap.set(row.identity_id as string, parseFloat(row.multiplier as string));
    }
    if (cacheMissIds.length > 0) {
      console.log(
        `[Snapshot] ${cacheMissIds.length} users with activity but no cache entry, ` +
        `${lastMultiplierMap.size} recovered from last known multiplier`,
      );
    }
  }

  const sf = REFERRAL_ECOSYSTEM_SCALING_FACTOR;
  const entries: SnapshotRow[] = [];

  for (const identityId of allIds) {
    const baseScore = filteredBaseMap.get(identityId) ?? 0;
    let activations = activationsCache.get(identityId) ?? [];
    const isPenalized = penalizedSet.has(identityId);

    let allianceHealth: number | null = null;
    let gpHealth: number | null = null;
    let multiplier: number;

    if (isV2) {
      const h = healthMap.get(identityId);
      // Holders not in healthMap: cold-start (no NFT yet) or dormant. Default 100%.
      allianceHealth = h?.alliance ?? 100;
      gpHealth = h?.gp ?? 100;
      const hasAlliance = activations.some(a => a.status === 'ACTIVE' && a.nftType === 'alliance');
      const hasGp = activations.some(a => a.status === 'ACTIVE' && a.nftType === 'genesis-pass');
      multiplier = calculateMultiplierV2(
        { alliance: allianceHealth, genesisPass: gpHealth } as NftHealth,
        hasAlliance,
        hasGp,
      );
    } else {
      if (isPenalized) {
        activations = activations.filter(a => a.nftType !== 'alliance');
      }
      multiplier = calculateMultiplier(activations);
    }

    // Cache miss protection: use last known multiplier if available (V1 only; V2 uses health)
    if (!isV2 && activations.length === 0 && !isPenalized && lastMultiplierMap.has(identityId)) {
      multiplier = lastMultiplierMap.get(identityId)!;
    } else if (isV2 && activations.length === 0 && lastMultiplierMap.has(identityId)) {
      multiplier = lastMultiplierMap.get(identityId)!;
    }
    const bonusTotal = bonusMap.get(identityId) ?? 0;
    const bonusTotalInclSynthetic = bonusCumMap.get(identityId) ?? bonusTotal;
    const referralBonus = referralMap.get(identityId) ?? 0;
    const governanceBonus = govMap.get(identityId) ?? 0;
    const stakingDelta = stakingMap.get(identityId) ?? 0;
    // Daily delta (delta column semantics: synthetic excluded from bonus_total).
    // Includes staking-daily tier pts so the per-day total matches the live header
    // formula in routes/ecosystem.ts (forward-only fix; past rows stay as written).
    const ecosystemScore = parseFloat(
      (baseScore * multiplier + bonusTotal + governanceBonus + referralBonus * sf + stakingDelta * multiplier).toFixed(2),
    );

    // Cumulative (ledger) is computed in SQL during INSERT (see step 7) using
    // raw numeric strings from prev — avoids JS float drift.
    const prev = prevMap.get(identityId);

    entries.push({
      identityId, baseScore, multiplier,
      bonusTotal, bonusTotalInclSynthetic,
      referralBonus, governanceBonus, stakingDelta,
      ecosystemScore, isPenalized,
      isV2Row: isV2,
      allianceHealth: isV2 ? allianceHealth : null,
      gpHealth: isV2 ? gpHealth : null,
      prevBaseStr: prev?.baseStr ?? '0',
      prevBonusStr: prev?.bonusStr ?? '0',
      prevGovStr: prev?.govStr ?? '0',
      prevRefStr: prev?.refStr ?? '0',
      prevStakingStr: prev?.stakingStr ?? '0',
    });
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

  // 8. Batch INSERT — cumulative ledger columns computed in SQL (numeric, exact).
  // Pre-PR-1(b): prev_*_str come from postgres as numeric strings; SQL adds
  // today's delta in numeric arithmetic, eliminating JS float drift across
  // long accumulation chains. all_time_score is the row-level sum of the
  // five components (computed once, stored).
  let inserted = 0;
  for (const e of entries) {
    const r = (e as SnapshotRow & { rank?: number }).rank ?? null;
    let result;
    if (e.isV2Row) {
      // V2: fill _v2 columns, leave legacy multiplier/ecosystem_score NULL
      result = await pointsDb`
        WITH cum AS (
          SELECT
            ${e.prevBaseStr}::numeric    + ${e.baseScore}::numeric * ${e.multiplier}::numeric    AS atb,
            ${e.prevBonusStr}::numeric   + ${e.bonusTotalInclSynthetic}::numeric                  AS atbo,
            ${e.prevGovStr}::numeric     + ${e.governanceBonus}::numeric                          AS atg,
            ${e.prevRefStr}::numeric     + ${e.referralBonus}::numeric * ${sf}::numeric           AS atr,
            ${e.prevStakingStr}::numeric + ${e.stakingDelta}::numeric * ${e.multiplier}::numeric  AS ats
        )
        INSERT INTO ecosystem_score_snapshots
          (identity_id, snapshot_date, base_score, bonus_total,
           referral_bonus, governance_bonus, is_penalized, rank,
           alliance_health, gp_health, multiplier_v2, ecosystem_score_v2,
           all_time_base, all_time_bonus, all_time_gov,
           all_time_referral_scaled, all_time_staking_scaled, all_time_score)
        SELECT
          ${e.identityId}, ${snapshotDate}::date, ${e.baseScore},
          ${e.bonusTotal.toFixed(2)},
          ${e.referralBonus.toFixed(2)}, ${e.governanceBonus.toFixed(2)},
          false, ${r},
          ${e.allianceHealth?.toFixed(2) ?? null}, ${e.gpHealth?.toFixed(2) ?? null},
          ${e.multiplier.toFixed(3)}, ${e.ecosystemScore.toFixed(3)},
          atb, atbo, atg, atr, ats,
          atb + atbo + atg + atr + ats
        FROM cum
        ON CONFLICT (identity_id, snapshot_date) DO NOTHING
      `;
    } else {
      // V1: fill legacy columns
      result = await pointsDb`
        WITH cum AS (
          SELECT
            ${e.prevBaseStr}::numeric    + ${e.baseScore}::numeric * ${e.multiplier}::numeric    AS atb,
            ${e.prevBonusStr}::numeric   + ${e.bonusTotalInclSynthetic}::numeric                  AS atbo,
            ${e.prevGovStr}::numeric     + ${e.governanceBonus}::numeric                          AS atg,
            ${e.prevRefStr}::numeric     + ${e.referralBonus}::numeric * ${sf}::numeric           AS atr,
            ${e.prevStakingStr}::numeric + ${e.stakingDelta}::numeric * ${e.multiplier}::numeric  AS ats
        )
        INSERT INTO ecosystem_score_snapshots
          (identity_id, snapshot_date, base_score, multiplier, bonus_total,
           referral_bonus, governance_bonus, ecosystem_score, is_penalized, rank,
           all_time_base, all_time_bonus, all_time_gov,
           all_time_referral_scaled, all_time_staking_scaled, all_time_score)
        SELECT
          ${e.identityId}, ${snapshotDate}::date, ${e.baseScore},
          ${e.multiplier.toFixed(2)}, ${e.bonusTotal.toFixed(2)},
          ${e.referralBonus.toFixed(2)}, ${e.governanceBonus.toFixed(2)},
          ${e.ecosystemScore.toFixed(2)}, ${e.isPenalized}, ${r},
          atb, atbo, atg, atr, ats,
          atb + atbo + atg + atr + ats
        FROM cum
        ON CONFLICT (identity_id, snapshot_date) DO NOTHING
      `;
    }
    if (result.count > 0) inserted++;
  }

  console.log(`[Snapshot] ${inserted} users snapshotted for ${snapshotDate}`);
}
