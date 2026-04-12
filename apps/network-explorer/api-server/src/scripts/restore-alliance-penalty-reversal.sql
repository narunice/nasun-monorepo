-- restore-alliance-penalty-reversal.sql
-- Incident: alliance penalty mass application on 2026-04-10 (c2def8fe → daf97d77 policy reversal)
-- Scope: 04-10 snapshot UPDATE for 15,509 alliance-only users
-- Principle: 사용자가 본 점수는 내려갈 수 없다 (점수 증가만 발생)
--
-- Background:
--   commit c2def8fe (2026-04-04) set PENALTY_ENFORCEMENT_START = '2026-04-11'
--   commit daf97d77 (2026-04-11 KST 14:16) extended it to '2026-04-16'
--   In the window 2026-04-11 00:14 UTC (04-10 snapshot creation), enforcement
--   briefly activated and marked 15,509 alliance-only users as penalized.
--   After daf97d77 deploy, alliance_penalties was cleared every cycle, but the
--   2026-04-10 snapshot rows (multiplier=0, is_penalized=TRUE) stayed frozen.
--
--   This script restores those 15,509 snapshot rows to their correct multiplier
--   (from 2026-04-09 snapshot, or 1.0 fallback for alliance default).
--
-- Usage:
--   sudo -u postgres psql -d nasun_points -f restore-alliance-penalty-reversal.sql

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL timezone = 'UTC';
SET LOCAL statement_timeout = '10min';
SET LOCAL lock_timeout = '30s';

-- Pre-check: audit table
DO $$
BEGIN
  IF to_regclass('public.snapshot_change_log') IS NULL THEN
    RAISE EXCEPTION 'public.snapshot_change_log does not exist. Apply audit-schema.sql first.';
  END IF;
END $$;

-- Step 1: Full-row backup of affected rows (pre-UPDATE state)
CREATE TABLE IF NOT EXISTS public._tmp_snapshot_backup_penalty_20260410 AS
SELECT * FROM ecosystem_score_snapshots WHERE FALSE;  -- empty, schema only
-- Idempotent: clear prior backup if re-run
DELETE FROM public._tmp_snapshot_backup_penalty_20260410;

INSERT INTO public._tmp_snapshot_backup_penalty_20260410
SELECT * FROM ecosystem_score_snapshots
WHERE snapshot_date = '2026-04-10'
  AND multiplier = 0 AND is_penalized AND base_score > 0;

COMMENT ON TABLE public._tmp_snapshot_backup_penalty_20260410 IS
  'Pre-UPDATE backup of 04-10 penalty-contaminated rows. Restore via UPDATE FROM this table. DROP after 2026-05-12.';

-- Step 2: Compute target multipliers (04-09 mult > 0, or 1.0 fallback for alliance default)
CREATE TEMP TABLE _new_mult ON COMMIT DROP AS
SELECT
  s10.identity_id,
  s10.base_score,
  s10.bonus_total,
  s10.referral_bonus,
  s10.governance_bonus,
  COALESCE(
    (SELECT s9.multiplier::numeric FROM ecosystem_score_snapshots s9
     WHERE s9.identity_id = s10.identity_id
       AND s9.snapshot_date = '2026-04-09'
       AND s9.multiplier > 0 LIMIT 1),
    1.0
  ) AS new_mult
FROM ecosystem_score_snapshots s10
WHERE s10.snapshot_date = '2026-04-10'
  AND s10.multiplier = 0 AND s10.is_penalized AND s10.base_score > 0;

CREATE INDEX ON _new_mult (identity_id);

-- Step 3: Assertion — backup count == target count
DO $$
DECLARE
  v_backup INT;
  v_target INT;
BEGIN
  SELECT COUNT(*) INTO v_backup FROM public._tmp_snapshot_backup_penalty_20260410;
  SELECT COUNT(*) INTO v_target FROM _new_mult;
  IF v_backup <> v_target THEN
    RAISE EXCEPTION 'backup/target mismatch: backup=%, target=%. Abort.', v_backup, v_target;
  END IF;
  IF v_target = 0 THEN
    RAISE EXCEPTION 'No rows matched penalty criteria — already recovered?';
  END IF;
  RAISE NOTICE 'Backup and target sizes match: %', v_target;
END $$;

-- Step 4: UPDATE snapshot rows
-- Formula (matches daily-snapshot.ts):
--   ecosystem_score = base*mult + bonus_total + governance_bonus + referral_bonus*0.5
UPDATE ecosystem_score_snapshots s
SET multiplier = n.new_mult,
    is_penalized = FALSE,
    ecosystem_score = ROUND(
      s.base_score * n.new_mult
      + COALESCE(s.bonus_total, 0)
      + COALESCE(s.governance_bonus, 0)
      + COALESCE(s.referral_bonus, 0) * 0.5
    , 2)
FROM _new_mult n
WHERE s.identity_id = n.identity_id
  AND s.snapshot_date = '2026-04-10';

-- Step 5: Audit log
INSERT INTO public.snapshot_change_log (
  operator, event, rows_affected, total_delta,
  dry_run_diff_hash, actual_diff_hash, notes
)
SELECT
  current_user,
  'alliance-penalty-reversal-2026-04-10',
  COUNT(*),
  SUM(n.base_score * n.new_mult),   -- total score restored (weighted)
  NULL,
  md5(string_agg(n.identity_id || ':' || n.base_score || ':' || n.new_mult,
                 ',' ORDER BY n.identity_id COLLATE "C")),
  jsonb_build_object(
    'incident', 'alliance-penalty-mass-application-c2def8fe-daf97d77',
    'principle', 'never-reduce-user-visible-score',
    'approach', 'snapshot-row-update (not activity_points INSERT) because multiplier was contaminated, not base_score',
    'backup_table', 'public._tmp_snapshot_backup_penalty_20260410',
    'affected_users_expected', 15509,
    'cause_note', 'PENALTY_ENFORCEMENT_START flipped 04-11 then rolled back to 04-16 within hours; 04-10 snapshot was frozen mid-enforcement',
    'policy_reference', 'apps/network-explorer/api-server/src/scanner/daily-nft-check.ts',
    'plan_version', 'v11'
  )
FROM _new_mult n;

COMMIT;

\echo 'Alliance penalty reversal recovery completed. Backup in _tmp_snapshot_backup_penalty_20260410.'
