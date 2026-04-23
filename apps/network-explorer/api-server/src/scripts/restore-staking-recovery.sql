-- restore-staking-recovery.sql
-- Incident: fc4b0e72 staking exclusion retroactive deduction
-- Cutoff: 2026-04-12 00:00:00 UTC
-- Principle: 사용자가 본 점수는 내려갈 수 없다 (원상 복구이지 정책 변경 아님)
-- Plan: ~/.claude/plans/lucky-herding-cloud.md (v10)
--
-- Category filter: ecosystem base_score scope (see db/ecosystem-schema.sql).
-- Must stay byte-identical with measure-expected-hash.sql.
--
-- Usage:
--   HASH=$(sudo -u postgres psql -d nasun_points -tAX \
--     -c "SET timezone='UTC'; $(cat measure-expected-hash.sql)")
--   sudo -u postgres psql -d nasun_points \
--     -v expected_hash="$HASH" \
--     -f restore-staking-recovery.sql 2>&1 | tee /tmp/restore-log-$(date +%s).txt

\set ON_ERROR_STOP on

\if :{?expected_hash}
\else
\echo 'ERROR: expected_hash not provided. Run: psql -v expected_hash=<hash> -f ...'
\quit 1
\endif

BEGIN;

SET LOCAL timezone = 'UTC';
SET LOCAL custom.expected_diff_hash = :'expected_hash';
SET LOCAL statement_timeout = '10min';
SET LOCAL lock_timeout = '30s';

-- Pre-check: audit table exists
DO $$
BEGIN
  IF to_regclass('public.snapshot_change_log') IS NULL THEN
    RAISE EXCEPTION 'public.snapshot_change_log does not exist. Apply audit-schema.sql first.';
  END IF;
END $$;

-- deltas (1x computation, shared across assertions + INSERT)
CREATE TEMP TABLE _deltas ON COMMIT DROP AS
WITH cats AS (
  SELECT DISTINCT identity_id, date_trunc('day', tx_timestamp)::date AS day, category
  FROM activity_points
  WHERE NOT flagged AND identity_id IS NOT NULL
    AND category NOT IN ('referral-bonus','daily-mission','ecosystem-passive','staking-daily')
    AND category NOT LIKE 'ecosystem-bonus-%'
    AND tx_timestamp >= '2026-04-01'::timestamptz
    AND (category <> 'staking' OR tx_timestamp < '2026-04-12 00:00:00+00'::timestamptz)
),
weighted AS (
  SELECT identity_id, day,
         CASE WHEN category='pado-dex' THEN 2 ELSE 1 END AS w,
         (category='staking') AS is_st
  FROM cats
)
SELECT identity_id, day,
       SUM(w) AS base_with_staking,
       COALESCE(SUM(w) FILTER (WHERE NOT is_st), 0) AS base_without_staking,
       SUM(w) - COALESCE(SUM(w) FILTER (WHERE NOT is_st), 0) AS delta
FROM weighted
GROUP BY identity_id, day
HAVING SUM(w) - COALESCE(SUM(w) FILTER (WHERE NOT is_st), 0) > 0;

CREATE INDEX ON _deltas (identity_id, day);

-- Latest valid wallet per identity (exclude flagged/synthetic)
CREATE TEMP TABLE _latest_wallet ON COMMIT DROP AS
SELECT DISTINCT ON (identity_id) identity_id, wallet_address
FROM activity_points
WHERE identity_id IS NOT NULL
  AND wallet_address IS NOT NULL
  AND NOT flagged
  AND (metadata->>'synthetic') IS DISTINCT FROM 'true'
ORDER BY identity_id, tx_timestamp DESC;

CREATE INDEX ON _latest_wallet (identity_id);

-- Assertions: hash + wallet drop
DO $$
DECLARE
  v_expected TEXT := current_setting('custom.expected_diff_hash', true);
  v_actual TEXT;
  v_dropped INT;
  v_dropped_ids TEXT;
BEGIN
  IF v_expected IS NULL OR v_expected = '' THEN
    RAISE EXCEPTION 'expected_diff_hash is null/empty';
  END IF;

  -- diff_hash (COLLATE "C" for deterministic ordering)
  SELECT md5(string_agg(identity_id || ':' || day || ':' || delta,
                        ',' ORDER BY identity_id COLLATE "C", day))
    INTO v_actual
    FROM _deltas;

  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'diff_hash mismatch: expected=%, actual=%. Re-measure expected_hash.',
      v_expected, v_actual;
  END IF;

  -- Wallet-drop assertion: every affected identity must have a valid wallet
  -- (subquery form avoids string_agg+LIMIT PostgreSQL syntax error)
  WITH dropped AS (
    SELECT DISTINCT d.identity_id
    FROM _deltas d
    LEFT JOIN _latest_wallet lw USING (identity_id)
    WHERE lw.wallet_address IS NULL
  ),
  sample AS (
    SELECT identity_id FROM dropped ORDER BY identity_id LIMIT 10
  )
  SELECT (SELECT COUNT(*) FROM dropped),
         (SELECT string_agg(identity_id, ',' ORDER BY identity_id) FROM sample)
    INTO v_dropped, v_dropped_ids;

  IF v_dropped > 0 THEN
    RAISE EXCEPTION 'wallet_drop=% identities have no valid wallet. Sample: %. Abort.',
      v_dropped, v_dropped_ids;
  END IF;

  RAISE NOTICE 'Assertions passed: diff_hash=%, wallet_drop=0', v_actual;
END $$;

-- Recovery INSERT + audit log (single CTE chain, shares temp tables)
WITH enriched AS (
  SELECT d.identity_id, d.day,
         d.base_with_staking, d.base_without_staking, d.delta,
         COALESCE(s.multiplier::numeric, 1.0) AS mult,
         lw.wallet_address AS wallet,
         (s.snapshot_date IS NOT NULL) AS had_snapshot
  FROM _deltas d
  LEFT JOIN ecosystem_score_snapshots s
    ON s.identity_id = d.identity_id AND s.snapshot_date = d.day
  JOIN _latest_wallet lw ON lw.identity_id = d.identity_id
),
inserted AS (
  INSERT INTO activity_points (
    wallet_address, identity_id, tx_digest, tx_sequence_number,
    category, activity_type, base_points, volume_tier, genesis_multiplier,
    final_points, tx_timestamp, metadata, event_seq, flagged
  )
  SELECT e.wallet, e.identity_id,
    'recovery:staking-' || e.identity_id || '-' || e.day::text,
    -1, 'ecosystem-bonus-restoration', 'restoration',
    e.delta, 1.0, 1.0, (e.delta * e.mult),
    (e.day::text || ' 00:00:00+00')::timestamptz,
    jsonb_build_object(
      'event', 'fc4b0e72-staking',
      'synthetic', true,
      'synthetic_kind', 'recovery',
      'original_day', e.day,
      'original_base_delta', e.delta,
      'pre_base_score', e.base_with_staking,
      'post_base_score', e.base_without_staking,
      'applied_multiplier', e.mult,
      'had_snapshot', e.had_snapshot,
      'wallet_resolution_strategy', 'latest-linked-at-recovery-time',
      'cutoff', '2026-04-12 00:00:00+00'),
    0, false
  FROM enriched e
  ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
  RETURNING identity_id, final_points,
            (metadata->>'original_day')::date AS inserted_day,
            base_points AS inserted_delta
)
INSERT INTO public.snapshot_change_log (
  operator, event, rows_affected, total_delta,
  dry_run_diff_hash, actual_diff_hash, notes
)
SELECT
  current_user,
  'fc4b0e72-staking-recovery',
  COUNT(*),
  COALESCE(SUM(final_points), 0),
  current_setting('custom.expected_diff_hash', true),
  md5(string_agg(identity_id || ':' || inserted_day || ':' || inserted_delta,
                 ',' ORDER BY identity_id COLLATE "C", inserted_day)),
  jsonb_build_object(
    'cutoff', '2026-04-12 00:00:00+00',
    'principle', 'never-reduce-user-visible-score',
    'evidence_note', 'backfill detected at 2026-04-11 15:21:30 UTC via created_at anomaly',
    'affected_users_expected', 14114,
    'rows_expected', 22942,
    'collate', 'C',
    'timezone', 'UTC',
    'plan_version', 'v10'
  )
FROM inserted;

COMMIT;

\echo 'Recovery completed. Run verification queries next.'
