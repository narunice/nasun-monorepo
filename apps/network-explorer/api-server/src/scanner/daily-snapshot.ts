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
  type NftActivation,
  type NftHealth,
} from '../config/ecosystem.js';
import { REFERRAL_ECOSYSTEM_SCALING_FACTOR } from '../config/referral.js';
import { STAKING_V2_CUTOFF_DATE, baseWeightFor } from '../config/points.js';
import { sendTelegramAlert } from '../utils/alert.js';
import { updateHealthForAllNftHolders } from './health-update.js';

import { DEFAULT_MISSION_IDS as DEFAULT_MISSION_IDS_ARR } from '../config/points.js';
// Set view of the canonical default mission list. Mutating the source array
// would not reach this snapshot copy at runtime, so re-derive at module load.
const DEFAULT_MISSION_IDS: ReadonlySet<string> = new Set(DEFAULT_MISSION_IDS_ARR);

/**
 * Take the daily ecosystem score snapshot.
 *
 * Returns `true` when the run reached the INSERT phase (including the benign
 * "no users today" case), so the caller can mark this date as done. Returns
 * `false` when an early fail-safe aborted before the INSERT phase (missing
 * health rows, matview-vs-live mismatch, no DB) so the caller leaves the
 * gate open for the next scanLoop to retry.
 */
export async function takeDailySnapshot(
  snapshotDate: string,
  activationsCache: Map<string, NftActivation[]>,
): Promise<boolean> {
  if (!pointsDb) return false;

  // 0. Short-circuit: if snapshotDate already has a row count comparable to
  //    the days around it, treat the snapshot as done. New NFT activations
  //    happening *today* will keep tripping the health-missing fail-safe
  //    forever otherwise, even though the snapshot we care about is already
  //    in the table from earlier scanLoop ticks. We do this *before* the
  //    expensive computation so the retry loop exits on the next scan after
  //    the day successfully snapshotted.
  const [coverageRow] = await pointsDb`
    WITH today AS (
      SELECT COUNT(*)::int AS today_count
      FROM ecosystem_score_snapshots WHERE snapshot_date = ${snapshotDate}::date
    ),
    neighbors AS (
      SELECT MAX(c)::int AS neighbor_max FROM (
        SELECT COUNT(*) AS c
        FROM ecosystem_score_snapshots
        WHERE snapshot_date BETWEEN (${snapshotDate}::date - 7) AND (${snapshotDate}::date - 1)
        GROUP BY snapshot_date
      ) s
    )
    SELECT today.today_count, neighbors.neighbor_max FROM today, neighbors
  `;
  const todayCount = (coverageRow?.today_count as number) ?? 0;
  const neighborMax = (coverageRow?.neighbor_max as number) ?? 0;
  // 95% of the best neighboring day is "good enough" — accounts for genuine
  // day-over-day variance without forcing exact equality. If neighbors are
  // empty (cold start), we still let the regular path run.
  if (neighborMax > 0 && todayCount >= Math.floor(neighborMax * 0.95)) {
    console.log(
      `[Snapshot] ${snapshotDate} already covered (${todayCount}/${neighborMax} = ` +
        `${Math.round((todayCount / neighborMax) * 100)}%); treating as done.`,
    );
    return true;
  }

  // 1. Load every user's active mission selection (full table — small).
  //    Users without a row get DEFAULT_MISSION_IDS applied at score-time.
  //
  //    The `missions` jsonb column has historically been written in two
  //    formats: a native jsonb array (correct, post-2026-05-04 fix) and a
  //    jsonb string holding the JSON-encoded array (legacy, from a stray
  //    JSON.stringify in the PUT handler). The legacy form decoded into a
  //    JS string here, which `new Set(...)` would then iterate per-character,
  //    matching no real category and zeroing every affected user's base_score
  //    in the snapshot (root cause of the 2026-05-03 incident). Read both
  //    shapes defensively until the migration normalizes every row.
  const userMissionsRows = await pointsDb`
    SELECT identity_id,
           CASE
             WHEN jsonb_typeof(missions) = 'array'  THEN missions
             WHEN jsonb_typeof(missions) = 'string' THEN (missions #>> '{}')::jsonb
             ELSE '[]'::jsonb
           END AS missions
    FROM user_active_missions
  `;
  const userMissionsMap = new Map<string, ReadonlySet<string>>();
  for (const row of userMissionsRows) {
    const arr = row.missions as unknown;
    if (!Array.isArray(arr)) continue;
    userMissionsMap.set(row.identity_id as string, new Set(arr as string[]));
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
    const weight = baseWeightFor(category);
    filteredBaseMap.set(identityId, (filteredBaseMap.get(identityId) ?? 0) + weight);
  }

  // 4. Collect all identity IDs (union of active-today + activationsCache)
  const allIds = new Set<string>();
  for (const id of filteredBaseMap.keys()) allIds.add(id);
  for (const id of activationsCache.keys()) allIds.add(id);

  if (allIds.size === 0) {
    console.log(`[Snapshot] No users to snapshot for ${snapshotDate}`);
    return true;
  }

  // 4b. Cross-check filteredBaseMap against the matview before locking in
  // an immutable snapshot. The 2026-05-03 incident wrote base=0 for ~7K
  // active users because the raw activity_points query returned 0 rows
  // while the matview had the correct data. ON CONFLICT DO NOTHING then
  // made the corruption permanent. This guard aborts the snapshot when
  // the two sources disagree by more than half, letting the next scanLoop
  // retry once the underlying inconsistency clears.
  const matviewActiveRow = await pointsDb`
    SELECT COUNT(*) FILTER (WHERE base_score > 0)::int AS active_users
    FROM ecosystem_daily_scores WHERE day = ${snapshotDate}::date
  `;
  const matviewActiveUsers = (matviewActiveRow[0]?.active_users as number) ?? 0;
  const ourActiveUsers = filteredBaseMap.size;
  if (matviewActiveUsers >= 100 && ourActiveUsers < matviewActiveUsers * 0.5) {
    console.error(
      `[Snapshot] CRITICAL ABORT: filteredBaseMap has ${ourActiveUsers} active users ` +
      `but matview shows ${matviewActiveUsers} for ${snapshotDate}. Skipping snapshot ` +
      `to avoid locking in zero base scores; next scanLoop will retry.`,
    );
    void sendTelegramAlert(
      `Snapshot ${snapshotDate} aborted: matview/live mismatch ` +
        `(live=${ourActiveUsers}, matview=${matviewActiveUsers}). Will retry next scanLoop.`,
      { dedupKey: `snapshot-matview-${snapshotDate}` },
    );
    return false;
  }

  // 5. Self-heal: ensure a health row exists for every current NFT holder.
  //
  // Race condition this closes: `runDailyNftChecks` advances the global
  // health watermark to `snapshotDate` early in the UTC day, so subsequent
  // scanLoop ticks skip re-running health-update for that date. Any NFT
  // activation that lands AFTER health-update ran but BEFORE this snapshot
  // therefore has no row for `snapshotDate`, even though it sits in the
  // activations cache used by the fail-safe below. Without this call the
  // fail-safe pins the snapshot indefinitely (root cause of the 2026-05-17
  // referral-bonus / snapshot lockout: 10 mid-day activations blocked the
  // snapshot, which in turn blocked `runDailyReferralBonus` for every
  // referrer in the system).
  //
  // Idempotent: `updateHealthForAllNftHolders`'s upsert is gated by
  // `last_evaluated_day < EXCLUDED.last_evaluated_day`, so users already
  // evaluated for `snapshotDate` are no-ops. For genuinely fresh holders
  // with no prior row, it inserts the correct default (100% — no decay yet
  // for a same-day activation).
  try {
    const heal = await updateHealthForAllNftHolders(activationsCache, snapshotDate);
    if (heal.updated > 0) {
      console.warn(
        `[Snapshot] Self-heal: wrote ${heal.updated} health rows for ${snapshotDate} ` +
        `(activations after health-update watermark; ${heal.skipped} no-ops).`,
      );
    }
  } catch (err) {
    // Non-fatal — fall through to the fail-safe below. If self-heal failed
    // *and* rows are missing, we still want to block the snapshot.
    console.error('[Snapshot] Self-heal health update error (non-fatal):', (err as Error).message);
  }

  // 6. Load health state for V3 multiplier. Fail-safe: bail if any NFT
  // holder is *still* missing a health row after self-heal, so we don't
  // lock in a broken snapshot.
  const allIdsArr = [...allIds];
  const healthMap = new Map<string, { alliance: number; gp: number }>();

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

  // Distinguish genuine misses (held NFT on snapshotDate but health row absent)
  // from post-snapshotDate activations (NFT minted/activated after the date,
  // so they legitimately have no history for it). Without this split the
  // fail-safe pins the snapshot all day for tomorrow's new holders, who
  // should not block today's lock-in.
  const minHealthRows = await pointsDb`
    SELECT identity_id, MIN(last_evaluated_day)::text AS min_day
    FROM nft_health_state
    WHERE identity_id = ANY(${allIdsArr})
    GROUP BY identity_id
  `;
  const minHealthMap = new Map<string, string>();
  for (const r of minHealthRows) {
    minHealthMap.set(r.identity_id as string, r.min_day as string);
  }

  const activeOnDateRows = await pointsDb`
    SELECT DISTINCT identity_id
    FROM activity_points
    WHERE NOT flagged
      AND identity_id = ANY(${allIdsArr})
      AND tx_timestamp >= ${snapshotDate}::date
      AND tx_timestamp <  (${snapshotDate}::date + interval '1 day')
  `;
  const activeOnDate = new Set(activeOnDateRows.map(r => r.identity_id as string));

  let missingCount = 0;
  let postDateActivations = 0;
  for (const [id, acts] of activationsCache) {
    const hasNft = acts.some(a => a.status === 'ACTIVE' &&
      (a.nftType === 'alliance' || a.nftType === 'genesis-pass'));
    if (!hasNft || healthMap.has(id)) continue;

    const minDay = minHealthMap.get(id);
    // Genuine miss: holder either was active on snapshotDate OR has health
    // history that begins on/before it. Either way they should have a row.
    // Otherwise they activated after snapshotDate and we skip silently.
    if (activeOnDate.has(id) || (minDay && minDay <= snapshotDate)) {
      missingCount++;
    } else {
      postDateActivations++;
    }
  }
  if (postDateActivations > 0) {
    console.log(
      `[Snapshot] Skipping ${postDateActivations} post-${snapshotDate} activations (no health row needed for older date).`,
    );
  }
  if (missingCount > 0) {
    console.error(
      `[Snapshot] Health missing for ${missingCount} NFT holders on ${snapshotDate}. Skipping snapshot.`,
    );
    if (missingCount > 10) {
      console.error('[Snapshot] ALERT: >10 missing holders, investigate health-update.');
    }
    // Per-date dedup with a single key so the alert fires at most once per
    // 5min RATE_LIMIT window per date (not once per count-bucket transition).
    void sendTelegramAlert(
      `Snapshot ${snapshotDate} blocked: ${missingCount} NFT holders missing health row. ` +
        `Will retry next scanLoop. If this persists past UTC midnight, manual backfill needed.`,
      { dedupKey: `snapshot-health-missing-${snapshotDate}` },
    );
    return false;
  }

  // 7. Batch bonus + referral + governance queries (date-filtered: today's delta only).
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

  // 7b. Previous cumulative per identity (anchor propagation).
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

  // 8. Calculate scores and rank.
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
    allianceHealth: number;
    gpHealth: number;
    // Prev cumulative as raw numeric strings -- passed to SQL for exact addition.
    prevBaseStr: string;
    prevBonusStr: string;
    prevGovStr: string;
    prevRefStr: string;
    prevStakingStr: string;
  }

  // Fallback multiplier: for users with base activity but no entry in
  // activationsCache (e.g. very new wallet hit by reconcile before the
  // 12h activations sync caught them), reuse their last known V3 multiplier
  // so we don't write a spurious 0-multiplier row.
  const cacheMissIds = allIdsArr.filter(
    id => filteredBaseMap.has(id) && !activationsCache.has(id),
  );
  const lastMultiplierMap = new Map<string, number>();
  if (cacheMissIds.length > 0) {
    const fallbackRows = await pointsDb`
      SELECT DISTINCT ON (identity_id) identity_id,
        COALESCE(multiplier_v2, multiplier)::numeric as multiplier
      FROM ecosystem_score_snapshots
      WHERE identity_id = ANY(${cacheMissIds})
        AND COALESCE(multiplier_v2, multiplier) > 0
      ORDER BY identity_id, snapshot_date DESC
    `;
    for (const row of fallbackRows) {
      lastMultiplierMap.set(row.identity_id as string, parseFloat(row.multiplier as string));
    }
    console.log(
      `[Snapshot] ${cacheMissIds.length} users with activity but no cache entry, ` +
      `${lastMultiplierMap.size} recovered from last known multiplier`,
    );
  }

  const sf = REFERRAL_ECOSYSTEM_SCALING_FACTOR;
  const entries: SnapshotRow[] = [];

  for (const identityId of allIds) {
    const baseScore = filteredBaseMap.get(identityId) ?? 0;
    const activations = activationsCache.get(identityId) ?? [];

    const h = healthMap.get(identityId);
    // Holders not in healthMap: cold-start (no NFT yet) or dormant. Default 100%.
    const allianceHealth = h?.alliance ?? 100;
    const gpHealth = h?.gp ?? 100;
    const hasAlliance = activations.some(a => a.status === 'ACTIVE' && a.nftType === 'alliance');
    const hasGp = activations.some(a => a.status === 'ACTIVE' && a.nftType === 'genesis-pass');
    let multiplier = calculateMultiplier(
      { alliance: allianceHealth, genesisPass: gpHealth } as NftHealth,
      hasAlliance,
      hasGp,
    );

    // Cache-miss recovery: keep last known positive multiplier instead of writing 0.
    if (activations.length === 0 && lastMultiplierMap.has(identityId)) {
      multiplier = lastMultiplierMap.get(identityId)!;
    }

    const bonusTotal = bonusMap.get(identityId) ?? 0;
    const bonusTotalInclSynthetic = bonusCumMap.get(identityId) ?? bonusTotal;
    const referralBonus = referralMap.get(identityId) ?? 0;
    const governanceBonus = govMap.get(identityId) ?? 0;
    const stakingDelta = stakingMap.get(identityId) ?? 0;
    // Daily delta. Includes staking-daily tier pts so the per-day total matches
    // the live header formula in routes/ecosystem.ts.
    const ecosystemScore = parseFloat(
      (baseScore * multiplier + bonusTotal + governanceBonus + referralBonus * sf + stakingDelta * multiplier).toFixed(2),
    );

    const prev = prevMap.get(identityId);

    entries.push({
      identityId, baseScore, multiplier,
      bonusTotal, bonusTotalInclSynthetic,
      referralBonus, governanceBonus, stakingDelta,
      ecosystemScore,
      allianceHealth, gpHealth,
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

  // 9. Batch INSERT. Cumulative ledger columns computed in SQL (numeric, exact)
  // so JS float drift can't accumulate across the long anchor chain. all_time_score
  // is the row-level sum of the five components, stored once.
  // Writes to _v2 columns; legacy multiplier/ecosystem_score stay NULL on new rows
  // and pre-cutover historical rows keep their original V1 values for display.
  let inserted = 0;
  for (const e of entries) {
    const r = (e as SnapshotRow & { rank?: number }).rank ?? null;
    const result = await pointsDb`
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
        ${e.allianceHealth.toFixed(2)}, ${e.gpHealth.toFixed(2)},
        ${e.multiplier.toFixed(3)}, ${e.ecosystemScore.toFixed(3)},
        atb, atbo, atg, atr, ats,
        atb + atbo + atg + atr + ats
      FROM cum
      ON CONFLICT (identity_id, snapshot_date) DO NOTHING
    `;
    if (result.count > 0) inserted++;
  }

  console.log(`[Snapshot] ${inserted} users snapshotted for ${snapshotDate}`);
  return true;
}
