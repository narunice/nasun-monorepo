/**
 * Ecosystem Points Invariant Audit
 *
 * Runs once per day after the snapshot + reconcile cycle and counts rows
 * that violate the cumulative ledger's invariants. Logs at WARN above the
 * configured thresholds so operations can spot drift before users do.
 *
 * Invariants checked (see docs/ecosystem-points-system.md §6):
 *   I1. anchor_chain_consistency:
 *       all_time_base[N] = all_time_base[prev] + base_score[N] * mult[N]
 *   I2. sum_invariant:
 *       all_time_score = SUM(all_time_base, all_time_bonus, all_time_gov,
 *                            all_time_referral_scaled, all_time_staking_scaled)
 *   I3. monotonic_all_time_score: prev <= next within a user's snapshot chain
 *
 * The 2026-05-04 incident exposed 20,917 stale anchor rows + 8,229 sum
 * gaps that had been silent since the V2 cutover. This audit catches the
 * same class of drift on day 1.
 */

import { pointsDb } from '../db.js';

// Threshold above which we log at WARN (rather than INFO).
// Ledger should be exact; any non-zero violation is suspicious. We tolerate
// a tiny non-zero count to absorb in-flight rows that race the audit window.
const WARN_THRESHOLD = 5;

interface AuditResult {
  anchorChainViolations: number;
  sumInvariantViolations: number;
  monotonicViolations: number;
  worstSumGap: number;
  worstAnchorGap: number;
}

let lastAuditDate = '';

export async function runInvariantAuditDaily(): Promise<void> {
  if (!pointsDb) return;
  const today = new Date().toISOString().slice(0, 10);
  if (today === lastAuditDate) return;
  lastAuditDate = today;

  try {
    const result = await runAudit();
    const isClean = result.anchorChainViolations === 0
      && result.sumInvariantViolations === 0
      && result.monotonicViolations === 0;
    const overThreshold = result.anchorChainViolations > WARN_THRESHOLD
      || result.sumInvariantViolations > WARN_THRESHOLD
      || result.monotonicViolations > WARN_THRESHOLD;

    const summary =
      `[InvariantAudit] anchor_chain_violations=${result.anchorChainViolations} ` +
      `sum_invariant_violations=${result.sumInvariantViolations} ` +
      `monotonic_violations=${result.monotonicViolations} ` +
      `worst_anchor_gap=${result.worstAnchorGap.toFixed(2)} ` +
      `worst_sum_gap=${result.worstSumGap.toFixed(2)}`;

    if (overThreshold) {
      console.error(`[InvariantAudit] ALERT: ledger drift detected. ${summary}`);
      console.error('[InvariantAudit] Run repair_cumulative_anchors.sql to rebuild.');
    } else if (!isClean) {
      console.warn(`[InvariantAudit] minor drift (within tolerance). ${summary}`);
    } else {
      console.log(`[InvariantAudit] CLEAN. ${summary}`);
    }
  } catch (err) {
    console.error('[InvariantAudit] Audit query failed:', (err as Error).message);
    // Reset so the next loop retries (don't pin lastAuditDate on failure).
    lastAuditDate = '';
  }
}

async function runAudit(): Promise<AuditResult> {
  // Single SQL pass with three CTEs to keep DB roundtrips minimal. Each
  // window function partitions by identity_id and walks the chain in
  // snapshot_date order, producing per-row violation flags that we then
  // aggregate.
  const [row] = await pointsDb!`
    WITH chained AS (
      SELECT identity_id, snapshot_date, base_score,
             COALESCE(multiplier_v2, multiplier) AS mult,
             all_time_base,
             all_time_bonus,
             all_time_gov,
             all_time_referral_scaled,
             all_time_staking_scaled,
             all_time_score,
             LAG(all_time_base) OVER w  AS prev_at_base,
             LAG(all_time_score) OVER w AS prev_at_score
      FROM ecosystem_score_snapshots
      WHERE all_time_score IS NOT NULL
      WINDOW w AS (PARTITION BY identity_id ORDER BY snapshot_date)
    )
    SELECT
      COUNT(*) FILTER (
        WHERE prev_at_base IS NOT NULL
          AND ABS(all_time_base - (prev_at_base + COALESCE(base_score,0) * COALESCE(mult,0))) > 0.01
      )::int AS anchor_chain_violations,
      COUNT(*) FILTER (
        WHERE ABS(all_time_score - (
          COALESCE(all_time_base,0) + COALESCE(all_time_bonus,0)
          + COALESCE(all_time_gov,0) + COALESCE(all_time_referral_scaled,0)
          + COALESCE(all_time_staking_scaled,0)
        )) > 0.01
      )::int AS sum_invariant_violations,
      COUNT(*) FILTER (
        WHERE prev_at_score IS NOT NULL AND all_time_score < prev_at_score - 0.01
      )::int AS monotonic_violations,
      COALESCE(MAX(ABS(all_time_score - (
        COALESCE(all_time_base,0) + COALESCE(all_time_bonus,0)
        + COALESCE(all_time_gov,0) + COALESCE(all_time_referral_scaled,0)
        + COALESCE(all_time_staking_scaled,0)
      ))), 0)::numeric AS worst_sum_gap,
      COALESCE(MAX(CASE
        WHEN prev_at_base IS NOT NULL
        THEN ABS(all_time_base - (prev_at_base + COALESCE(base_score,0) * COALESCE(mult,0)))
        ELSE 0
      END), 0)::numeric AS worst_anchor_gap
    FROM chained
  `;
  return {
    anchorChainViolations: Number(row?.anchor_chain_violations ?? 0),
    sumInvariantViolations: Number(row?.sum_invariant_violations ?? 0),
    monotonicViolations: Number(row?.monotonic_violations ?? 0),
    worstSumGap: parseFloat(row?.worst_sum_gap ?? '0'),
    worstAnchorGap: parseFloat(row?.worst_anchor_gap ?? '0'),
  };
}
