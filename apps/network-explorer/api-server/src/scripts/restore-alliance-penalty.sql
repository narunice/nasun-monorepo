-- restore-alliance-penalty.sql
-- Incident: Alliance penalty recovery bug (2026-04-19)
--   Recovery check used CURRENT_DATE - 1 window, making 2-day condition
--   impossible to satisfy at midnight when today has zero activity.
-- Effect: 5,739 users stuck in penalized state longer than intended.
--   Lost points = base_score per penalized day (alliance-only = 1x multiplier).
-- Scope: all ecosystem_score_snapshots rows where is_penalized=true AND base_score>0
--   for users no longer in alliance_penalties (freed by today's bulk delete).
-- Idempotent: UNIQUE(tx_digest, activity_type, event_seq) prevents double-insert.
--
-- Usage:
--   sudo -u postgres psql -d nasun_points -f restore-alliance-penalty.sql \
--     2>&1 | tee /tmp/restore-alliance-penalty-$(date +%s).txt

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL timezone = 'UTC';
SET LOCAL statement_timeout = '15min';
SET LOCAL lock_timeout = '30s';

-- Pre-check: audit table exists
DO $$
BEGIN
  IF to_regclass('public.snapshot_change_log') IS NULL THEN
    RAISE EXCEPTION 'public.snapshot_change_log does not exist. Apply audit-schema.sql first.';
  END IF;
END $$;

-- Build delta table: one row per (identity_id, snapshot_date) where points were lost
CREATE TEMP TABLE _penalty_deltas ON COMMIT DROP AS
WITH penalized_days AS (
  SELECT
    ess.identity_id,
    ess.snapshot_date,
    ess.base_score                                    AS lost_points,
    ess.multiplier                                    AS applied_multiplier,
    ess.ecosystem_score                               AS original_score
  FROM ecosystem_score_snapshots ess
  WHERE ess.is_penalized = true
    AND ess.base_score > 0
    -- Only users we freed today (not currently penalized)
    AND NOT EXISTS (
      SELECT 1 FROM alliance_penalties ap
      WHERE ap.identity_id = ess.identity_id
    )
    -- Skip if already restored for this event+day (idempotency check)
    AND NOT EXISTS (
      SELECT 1 FROM activity_points ap2
      WHERE ap2.tx_digest = 'recovery:alliance-penalty-' || ess.identity_id || '-' || ess.snapshot_date::text
        AND ap2.activity_type = 'restoration'
        AND ap2.event_seq = 0
    )
),
user_wallets AS (
  SELECT DISTINCT ON (identity_id)
    identity_id, wallet_address
  FROM activity_points
  WHERE identity_id = ANY(SELECT DISTINCT identity_id FROM penalized_days)
  ORDER BY identity_id, tx_timestamp DESC
)
SELECT
  pd.identity_id,
  pd.snapshot_date,
  pd.lost_points,
  pd.applied_multiplier,
  pd.original_score,
  uw.wallet_address
FROM penalized_days pd
JOIN user_wallets uw USING (identity_id);

-- Pre-flight assertions
DO $$
DECLARE
  v_users  INT;
  v_days   INT;
  v_points NUMERIC;
BEGIN
  SELECT COUNT(DISTINCT identity_id), COUNT(*), SUM(lost_points)
    INTO v_users, v_days, v_points
  FROM _penalty_deltas;

  RAISE NOTICE 'Restoring: % users, % penalized days, % total points', v_users, v_days, v_points;

  IF v_users = 0 THEN
    RAISE NOTICE 'No users to restore -- already applied or no penalized snapshots found.';
    RETURN;
  END IF;
  IF v_points <= 0 THEN
    RAISE EXCEPTION 'Total points to restore is <= 0, aborting.';
  END IF;
END $$;

-- Insert restoration rows
INSERT INTO activity_points (
  wallet_address,
  identity_id,
  tx_digest,
  tx_sequence_number,
  event_seq,
  category,
  activity_type,
  base_points,
  volume_tier,
  genesis_multiplier,
  final_points,
  tx_timestamp,
  metadata
)
SELECT
  d.wallet_address,
  d.identity_id,
  'recovery:alliance-penalty-' || d.identity_id || '-' || d.snapshot_date::text,
  0,
  0,
  'ecosystem-bonus-restoration',
  'restoration',
  d.lost_points,
  1.0,
  1.0,
  d.lost_points,
  NOW(),
  jsonb_build_object(
    'synthetic',          true,
    'synthetic_kind',     'recovery',
    'event',              'alliance-penalty-bug-2026-04-19',
    'original_day',       d.snapshot_date::text,
    'lost_points',        d.lost_points,
    'applied_multiplier', d.applied_multiplier,
    'original_score',     d.original_score
  )
FROM _penalty_deltas d
ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING;

-- Post-check: verify inserted count matches delta count
DO $$
DECLARE
  v_inserted BIGINT;
  v_expected BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_expected FROM _penalty_deltas;

  SELECT COUNT(*) INTO v_inserted
  FROM activity_points
  WHERE tx_digest LIKE 'recovery:alliance-penalty-%'
    AND activity_type = 'restoration'
    AND event_seq = 0
    AND processed_at >= NOW() - INTERVAL '5 minutes';

  RAISE NOTICE 'Inserted % restoration rows (expected %)', v_inserted, v_expected;

  IF v_inserted < v_expected THEN
    RAISE NOTICE 'Some rows already existed (ON CONFLICT DO NOTHING). This is safe if re-running.';
  END IF;
END $$;

-- Audit log
INSERT INTO snapshot_change_log (operator, event, rows_affected, total_delta, notes)
VALUES (
  'restore-alliance-penalty.sql',
  'alliance-penalty-bug-2026-04-19',
  (SELECT COUNT(*) FROM _penalty_deltas)::int,
  (SELECT SUM(lost_points) FROM _penalty_deltas),
  jsonb_build_object(
    'users',       (SELECT COUNT(DISTINCT identity_id) FROM _penalty_deltas),
    'days',        (SELECT COUNT(*) FROM _penalty_deltas),
    'total_points',(SELECT SUM(lost_points) FROM _penalty_deltas)
  )
);

COMMIT;

-- Refresh matview so live scores reflect restoration
REFRESH MATERIALIZED VIEW CONCURRENTLY ecosystem_daily_scores;

\echo 'Done. Check /tmp/restore-alliance-penalty-*.txt for details.'
