-- ============================================================
-- Points Integrity Guard (trigger-based)
-- ============================================================
-- Objective: prevent silent reduction of user All Time points
-- through any UPDATE/DELETE/TRUNCATE on `activity_points`.
-- Runtime code is INSERT-only; only explicit admin corrections
-- are allowed, gated by a session flag.
--
-- Apply via psql (one-shot, idempotent):
--   psql "$POINTS_DATABASE_URL" -f points-integrity-guard.sql
--
-- Admin correction pattern (e.g., rollback-staking-recovery.sql):
--   BEGIN;
--     SET LOCAL app.allow_points_mutation = 'on';
--     -- UPDATE / DELETE statements ...
--   COMMIT;
--
-- Rollback (remove guard):
--   DROP TRIGGER IF EXISTS _apg_no_update    ON activity_points;
--   DROP TRIGGER IF EXISTS _apg_no_delete    ON activity_points;
--   DROP TRIGGER IF EXISTS _apg_no_truncate  ON activity_points;
--   DROP FUNCTION IF EXISTS _activity_points_guard();
-- ============================================================

-- --- Guard function --------------------------------------------------
CREATE OR REPLACE FUNCTION _activity_points_guard()
RETURNS TRIGGER AS $$
DECLARE
  allow_flag TEXT;
BEGIN
  -- current_setting with missing_ok=true returns '' (empty) when unset,
  -- preventing "unrecognized configuration parameter" errors.
  allow_flag := current_setting('app.allow_points_mutation', true);

  IF allow_flag = 'on' THEN
    -- Admin override in effect: permit the operation.
    -- NEW is NULL for DELETE/TRUNCATE; OLD is NULL for INSERT (N/A here).
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION 'activity_points mutation blocked by integrity guard'
    USING
      ERRCODE = 'P0001',
      DETAIL  = 'All mutation of activity_points is prohibited by default. '
                'Runtime code (API routes, scanners) must be INSERT-only.',
      HINT    = 'For legitimate admin corrections, run inside an explicit '
                'transaction with: SET LOCAL app.allow_points_mutation = ''on'';';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION _activity_points_guard() IS
  'Integrity guard for activity_points. Blocks UPDATE/DELETE/TRUNCATE '
  'unless the session variable app.allow_points_mutation is set to ''on''. '
  'See /home/naru/.claude/plans/points-integrity-defenses.md (v2).';

-- --- Triggers --------------------------------------------------------
-- BEFORE UPDATE: row-level
DROP TRIGGER IF EXISTS _apg_no_update ON activity_points;
CREATE TRIGGER _apg_no_update
  BEFORE UPDATE ON activity_points
  FOR EACH ROW
  EXECUTE FUNCTION _activity_points_guard();

-- BEFORE DELETE: row-level
DROP TRIGGER IF EXISTS _apg_no_delete ON activity_points;
CREATE TRIGGER _apg_no_delete
  BEFORE DELETE ON activity_points
  FOR EACH ROW
  EXECUTE FUNCTION _activity_points_guard();

-- BEFORE TRUNCATE: statement-level (row triggers don't fire on TRUNCATE)
DROP TRIGGER IF EXISTS _apg_no_truncate ON activity_points;
CREATE TRIGGER _apg_no_truncate
  BEFORE TRUNCATE ON activity_points
  FOR EACH STATEMENT
  EXECUTE FUNCTION _activity_points_guard();

-- --- Verification ----------------------------------------------------
-- (run manually after apply; expects 3 triggers + 1 function)
-- SELECT tgname, tgenabled, tgtype FROM pg_trigger
--   WHERE tgrelid = 'activity_points'::regclass
--     AND tgname LIKE '_apg_%';
--
-- Test (should RAISE P0001):
--   UPDATE activity_points SET flagged = flagged WHERE FALSE;
--
-- Test override (should succeed, zero-row):
--   BEGIN;
--   SET LOCAL app.allow_points_mutation = 'on';
--   UPDATE activity_points SET flagged = flagged WHERE FALSE;
--   ROLLBACK;
