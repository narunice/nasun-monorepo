-- ============================================================
-- Ecosystem Score Snapshot: add cumulative (ledger) columns
-- ============================================================
-- Ledger refactor v3 (anchor-from-latest-snapshot). Each user's
-- latest snapshot row becomes an immutable cumulative anchor;
-- subsequent daily snapshots append delta to the previous row's
-- cumulative. See:
--   /home/naru/.claude/plans/ecosystem-points-ledger-refactor.md
--
-- All columns are NULLABLE — pre-refactor rows stay NULL and are
-- ignored by the new API path. Anchor is planted by the bootstrap
-- script (scripts/bootstrap-snapshot-cumulative.ts) on the MAX
-- snapshot_date row per identity.
--
-- Apply:
--   sudo -u postgres psql -d nasun_points -f add-cumulative-snapshot-cols.sql
--
-- Rollback (block at bottom, commented).
-- ============================================================

BEGIN;
SET LOCAL statement_timeout = '5min';
SET LOCAL lock_timeout = '30s';

ALTER TABLE ecosystem_score_snapshots
  ADD COLUMN IF NOT EXISTS all_time_score           NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS all_time_base            NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS all_time_bonus           NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS all_time_gov             NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS all_time_referral_scaled NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS all_time_staking_scaled  NUMERIC(14, 2);

COMMENT ON COLUMN ecosystem_score_snapshots.all_time_score IS
  'Cumulative ecosystem All Time score as of snapshot_date. '
  'Populated by bootstrap (from current LIVE API) and then by daily '
  'snapshot job as prev.all_time_score + today.delta. NULL on '
  'pre-refactor rows — the new API path skips those automatically.';

COMMENT ON COLUMN ecosystem_score_snapshots.all_time_base IS
  'Cumulative base * multiplier contribution.';

COMMENT ON COLUMN ecosystem_score_snapshots.all_time_bonus IS
  'Cumulative ecosystem-bonus-* contribution (synthetic included '
  'at anchor time per ecosystem.ts LIVE semantics).';

COMMENT ON COLUMN ecosystem_score_snapshots.all_time_gov IS
  'Cumulative governance contribution.';

COMMENT ON COLUMN ecosystem_score_snapshots.all_time_referral_scaled IS
  'Cumulative referral-bonus * scalingFactor contribution. Frozen at '
  'snapshot time — scalingFactor changes only affect future days.';

COMMENT ON COLUMN ecosystem_score_snapshots.all_time_staking_scaled IS
  'Cumulative staking-daily tier pts * multiplier (v2, post-2026-04-14).';

-- Golden Rule: non-negative score
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ess_all_time_score_nonneg'
      AND conrelid = 'ecosystem_score_snapshots'::regclass
  ) THEN
    ALTER TABLE ecosystem_score_snapshots
      ADD CONSTRAINT ess_all_time_score_nonneg
        CHECK (all_time_score IS NULL OR all_time_score >= 0);
  END IF;
END $$;

-- Index supports "latest anchor" lookup path: for a given identity,
-- find MAX(snapshot_date) WHERE all_time_score IS NOT NULL.
CREATE INDEX IF NOT EXISTS idx_ess_identity_anchor
  ON ecosystem_score_snapshots(identity_id, snapshot_date DESC)
  WHERE all_time_score IS NOT NULL;

COMMIT;

-- ------------------------------------------------------------
-- Verification (run manually)
-- ------------------------------------------------------------
-- \d+ ecosystem_score_snapshots                          -- confirm 6 new cols
-- SELECT COUNT(*) FROM ecosystem_score_snapshots
--   WHERE all_time_score IS NOT NULL;                    -- expect 0 pre-bootstrap
--
-- ------------------------------------------------------------
-- Rollback (commented)
-- ------------------------------------------------------------
-- BEGIN;
--   ALTER TABLE ecosystem_score_snapshots
--     DROP CONSTRAINT IF EXISTS ess_all_time_score_nonneg,
--     DROP COLUMN IF EXISTS all_time_score,
--     DROP COLUMN IF EXISTS all_time_base,
--     DROP COLUMN IF EXISTS all_time_bonus,
--     DROP COLUMN IF EXISTS all_time_gov,
--     DROP COLUMN IF EXISTS all_time_referral_scaled,
--     DROP COLUMN IF EXISTS all_time_staking_scaled;
--   DROP INDEX IF EXISTS idx_ess_identity_anchor;
-- COMMIT;
