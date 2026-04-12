-- audit-schema.sql
-- Admin/operator change log for recovery and schema-related incidents.
--
-- ⚠️  CAUTION: Apply with autocommit psql only.
--     CREATE INDEX CONCURRENTLY is incompatible with BEGIN/COMMIT blocks.
--     Run:  sudo -u postgres psql -d nasun_points -f audit-schema.sql

CREATE TABLE IF NOT EXISTS public.snapshot_change_log (
  id BIGSERIAL PRIMARY KEY,
  operator TEXT NOT NULL,
  event TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rows_affected INT NOT NULL,
  total_delta NUMERIC NOT NULL,
  dry_run_diff_hash TEXT,
  actual_diff_hash TEXT,
  notes JSONB
);

CREATE INDEX IF NOT EXISTS idx_snapshot_change_log_event
  ON public.snapshot_change_log(event);

-- Partial expression index: fast lookup of synthetic (recovery/migration) rows.
-- Small target set so (identity_id, category) yields highly selective index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ap_synthetic
  ON public.activity_points (identity_id, category)
  WHERE (metadata->>'synthetic') = 'true' AND NOT flagged;
