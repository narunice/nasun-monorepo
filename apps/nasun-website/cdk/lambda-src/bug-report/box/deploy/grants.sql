-- Box nasun_dal schema + grants for the nasun-bug-report service (AWS-exit Stage 4, BugReportStack slice).
-- Run as a superuser/owner AFTER creating the writer role (see below):
--   sudo -u postgres psql nasun_dal -f grants.sql
--
-- These tables are NEW (not part of the Phase 1 dal-load), so this script creates them. Idempotent. The DDB
-- key (reportId, timestamp) / (postId) collapses to a PG PK on the globally-unique id; the DDB sort key
-- `timestamp` becomes report_ts (re-surfaced as `timestamp` in the reconstructed item). The long-tail lives in
-- `attributes` jsonb (reconstructors in src/db.ts overlay the promoted columns -> DDB-identical item).

-- ---- tables -------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bug_reports (
  report_id   text PRIMARY KEY,
  report_ts   text NOT NULL,
  identity_id text NOT NULL,
  status      text NOT NULL DEFAULT 'new',
  attributes  jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- identityId-index GSI (my-reports, cooldown): newest-first per identity.
CREATE INDEX IF NOT EXISTS bug_reports_identity_idx ON bug_reports (identity_id, report_ts DESC);
-- status-index GSI (admin list): newest-first per status. Also serves the backfill status IN (...) scan.
CREATE INDEX IF NOT EXISTS bug_reports_status_idx ON bug_reports (status, report_ts DESC);

CREATE TABLE IF NOT EXISTS creator_posts (
  post_id     text PRIMARY KEY,
  identity_id text NOT NULL,
  created_at  text NOT NULL,
  status      text NOT NULL DEFAULT 'PENDING',
  attributes  jsonb NOT NULL DEFAULT '{}'::jsonb
);
-- identityId-createdAt-index GSI (my list, daily-limit count).
CREATE INDEX IF NOT EXISTS creator_posts_identity_idx ON creator_posts (identity_id, created_at DESC);
-- status-createdAt-index GSI (admin list).
CREATE INDEX IF NOT EXISTS creator_posts_status_idx ON creator_posts (status, created_at DESC);

-- ---- writer role (dedicated, least-privilege) ---------------------------------------------------------------
-- Create the role with a box-generated password FIRST (out-of-band, NOT committed):
--   CREATE ROLE nasun_bug_report LOGIN PASSWORD '<openssl rand -hex 24>';
-- Teardown: DROP OWNED BY nasun_bug_report; DROP ROLE nasun_bug_report; (after the AWS BugReportStack is gone).

GRANT CONNECT ON DATABASE nasun_dal TO nasun_bug_report;
GRANT USAGE ON SCHEMA public TO nasun_bug_report;
GRANT SELECT, INSERT, UPDATE, DELETE ON bug_reports, creator_posts TO nasun_bug_report;

-- ---- read role ---------------------------------------------------------------------------------------------
-- Service read pool.
GRANT SELECT ON bug_reports, creator_posts TO nasun_compute_ro;
-- Admin-role check on user_profiles (parity with the referral/leaderboard box admin). dal-reload is stopped
-- (box = SoT), so this grant is stable (no DROP+recreate of user_profiles).
GRANT SELECT ON user_profiles TO nasun_compute_ro;
