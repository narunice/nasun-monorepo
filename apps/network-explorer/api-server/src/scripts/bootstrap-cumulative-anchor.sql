-- ============================================================
-- Bootstrap: anchor cumulative on latest snapshot per identity
-- ============================================================
-- Ledger refactor v3 Phase 2.
--
-- For each identity's MAX(snapshot_date) row, compute cumulative
-- All Time values matching the LIVE API formula and store them in
-- the all_time_* columns. Directly aggregates activity_points
-- (not snapshot deltas) because historical snapshot columns for
-- governance_bonus / referral_bonus were sometimes zero before the
-- column was added — causing a delta-SUM underestimate.
--
-- Boundary: anchor captures activity with tx_timestamp < (anchor_date + 1 day).
-- Post-anchor activity is the API's job via the live delta path.
--
-- Golden Rule: `all_time_score` must be >= current LIVE API
-- response for the identity. Verification script checks this.
--
-- Apply (idempotent; safe to re-run — clears and rewrites anchor):
--   sudo -u postgres psql -d nasun_points -f bootstrap-cumulative-anchor.sql
-- ============================================================

BEGIN;
SET LOCAL statement_timeout = '30min';
SET LOCAL lock_timeout = '1min';

-- Referral scaling factor (keep in sync with REFERRAL_ECOSYSTEM_SCALING_FACTOR).
\set sf 0.5

-- -----------------------------------------------------------------
-- Step 1: clear any prior anchor (idempotent re-runs)
-- -----------------------------------------------------------------
UPDATE ecosystem_score_snapshots
SET all_time_score = NULL, all_time_base = NULL, all_time_bonus = NULL,
    all_time_gov = NULL, all_time_referral_scaled = NULL,
    all_time_staking_scaled = NULL
WHERE all_time_score IS NOT NULL;

-- -----------------------------------------------------------------
-- Step 2: compute & write anchor for each identity
-- -----------------------------------------------------------------
WITH
anchor_dates AS (
  SELECT identity_id, MAX(snapshot_date) AS anchor_date
  FROM ecosystem_score_snapshots
  GROUP BY identity_id
),
-- Base: SUM of base_score * multiplier across all snapshot rows up to anchor.
-- This matches ecosystem.ts:94 (baseCumulative from snapshots).
base_cum AS (
  SELECT s.identity_id, SUM(s.base_score::numeric * s.multiplier) AS v
  FROM ecosystem_score_snapshots s
  JOIN anchor_dates a ON s.identity_id = a.identity_id
  WHERE s.snapshot_date <= a.anchor_date
  GROUP BY s.identity_id
),
-- Bonus: entire history, synthetic INCLUDED (matches ecosystem.ts:113).
bonus_cum AS (
  SELECT ap.identity_id, SUM(ap.final_points) AS v
  FROM activity_points ap
  JOIN anchor_dates a ON ap.identity_id = a.identity_id
  WHERE ap.category LIKE 'ecosystem-bonus-%'
    AND NOT ap.flagged
    AND ap.tx_timestamp < a.anchor_date + interval '1 day'
  GROUP BY ap.identity_id
),
gov_cum AS (
  SELECT ap.identity_id, SUM(ap.final_points) AS v
  FROM activity_points ap
  JOIN anchor_dates a ON ap.identity_id = a.identity_id
  WHERE ap.category = 'governance'
    AND NOT ap.flagged
    AND ap.tx_timestamp < a.anchor_date + interval '1 day'
  GROUP BY ap.identity_id
),
ref_cum AS (
  SELECT ap.identity_id, SUM(ap.final_points) AS v_raw
  FROM activity_points ap
  JOIN anchor_dates a ON ap.identity_id = a.identity_id
  WHERE ap.category = 'referral-bonus'
    AND NOT ap.flagged
    AND ap.tx_timestamp < a.anchor_date + interval '1 day'
  GROUP BY ap.identity_id
)
-- Pre-2026-04-14 cutoff: staking-v2 has no rows yet; all_time_staking_scaled = 0.
-- Post-cutoff staking is accumulated by the daily snapshot job going forward.
UPDATE ecosystem_score_snapshots s
SET
  all_time_base            = COALESCE(bc.v, 0),
  all_time_bonus           = COALESCE(boc.v, 0),
  all_time_gov             = COALESCE(gc.v, 0),
  all_time_referral_scaled = COALESCE(rc.v_raw, 0) * :sf,
  all_time_staking_scaled  = 0,
  all_time_score           = COALESCE(bc.v, 0)
                           + COALESCE(boc.v, 0)
                           + COALESCE(gc.v, 0)
                           + COALESCE(rc.v_raw, 0) * :sf
FROM anchor_dates a
LEFT JOIN base_cum bc  ON a.identity_id = bc.identity_id
LEFT JOIN bonus_cum boc ON a.identity_id = boc.identity_id
LEFT JOIN gov_cum gc   ON a.identity_id = gc.identity_id
LEFT JOIN ref_cum rc   ON a.identity_id = rc.identity_id
WHERE s.identity_id = a.identity_id
  AND s.snapshot_date = a.anchor_date;

-- -----------------------------------------------------------------
-- Step 3: verification inside the transaction
-- -----------------------------------------------------------------

-- 3a. Anchor row count must equal distinct identities
SELECT
  (SELECT COUNT(DISTINCT identity_id) FROM ecosystem_score_snapshots) AS distinct_identities,
  (SELECT COUNT(*) FROM ecosystem_score_snapshots WHERE all_time_score IS NOT NULL) AS anchor_rows;

-- 3b. Sum sanity
SELECT COUNT(*) AS rows_with_sum_mismatch
FROM ecosystem_score_snapshots
WHERE all_time_score IS NOT NULL
  AND ABS(
    all_time_score
    - COALESCE(all_time_base, 0)
    - COALESCE(all_time_bonus, 0)
    - COALESCE(all_time_gov, 0)
    - COALESCE(all_time_referral_scaled, 0)
    - COALESCE(all_time_staking_scaled, 0)
  ) > 0.01;

-- 3c. Non-negative guard
SELECT COUNT(*) AS negative_anchor_rows
FROM ecosystem_score_snapshots
WHERE all_time_score < 0;

-- 3d. Sample 5 biggest
SELECT identity_id, snapshot_date AS anchor_date,
       all_time_score, all_time_base, all_time_bonus,
       all_time_gov, all_time_referral_scaled, all_time_staking_scaled
FROM ecosystem_score_snapshots
WHERE all_time_score IS NOT NULL
ORDER BY all_time_score DESC
LIMIT 5;

COMMIT;
