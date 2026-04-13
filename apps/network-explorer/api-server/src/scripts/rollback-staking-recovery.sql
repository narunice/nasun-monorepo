-- rollback-staking-recovery.sql
-- Incident: fc4b0e72 staking exclusion retroactive deduction
-- Rolls back the restoration applied by restore-staking-recovery.sql
--
-- USE ONLY when a critical data integrity defect is found within the
-- cache-TTL window (recommended within 24h of restoration execution).
-- Beyond that window, restoration points have been user-visible →
-- reverting violates the "never reduce user-visible score" principle.
-- In that case use compensating forward correction instead.
--
-- Usage:
--   sudo -u postgres psql -d nasun_points -f rollback-staking-recovery.sql

BEGIN;

SET LOCAL timezone = 'UTC';
SET LOCAL statement_timeout = '5min';
SET LOCAL lock_timeout = '30s';
-- Integrity guard override: authorize this admin session to UPDATE
-- activity_points (see points-integrity-guard.sql). Scoped to this
-- transaction only.
SET LOCAL app.allow_points_mutation = 'on';

-- Flag the restoration rows (audit-preserving soft delete; API filters NOT flagged)
UPDATE activity_points
SET flagged = TRUE,
    flag_reason = 'rollback:fc4b0e72-restoration-abort'
WHERE category = 'ecosystem-bonus-restoration'
  AND metadata->>'event' = 'fc4b0e72-staking'
  AND processed_at > now() - interval '24 hours'
  AND NOT flagged;

-- Audit log
INSERT INTO public.snapshot_change_log (
  operator, event, rows_affected, total_delta, notes
)
SELECT
  current_user,
  'fc4b0e72-staking-rollback',
  COUNT(*),
  -COALESCE(SUM(final_points), 0),
  jsonb_build_object(
    'reason', 'critical-data-integrity-failure',
    'rolled_back_within_24h', true,
    'plan_version', 'v10'
  )
FROM activity_points
WHERE flag_reason = 'rollback:fc4b0e72-restoration-abort';

COMMIT;

\echo 'Rollback completed. Cache TTL (30s-5min) must elapse before users see reverted scores.'
