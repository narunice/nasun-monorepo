-- Box nasun_dal grants for the nasun-bug-report service (AWS-exit Stage 4, BugReportStack slice).
-- Run via stdin so the postgres OS user does not need to read a file under ~nasun:
--   sudo -u postgres psql nasun_dal < grants.sql
--
-- bug_reports / creator_posts ALREADY EXIST as the DAL DDB->PG mirror "P2" tables (created by dal-load; owner
-- nasun_app; verified \d 2026-06-24: bug_reports 1066 rows / creator_posts 6109 rows). The CREATE statements
-- below are IF NOT EXISTS and match the live schema EXACTLY, so they are no-ops on the current box; kept as the
-- authoritative rebuild record. The ONLY effective change this script makes is the GRANTs (the tables currently
-- carry only nasun_app=arwdDxt + nasun_keeper=r; the box service needs compute_ro SELECT + a writer role).

-- ---- tables (authoritative record; no-op on the live box) ---------------------------------------------------
-- ts / created_at are timestamptz (the DDB `timestamp` / `createdAt` ISO strings). report_id / post_id are
-- globally unique; the composite bug_reports PK preserves the DDB (reportId, timestamp) key.
CREATE TABLE IF NOT EXISTS bug_reports (
  report_id   text NOT NULL,
  ts          timestamptz NOT NULL,
  status      text,
  identity_id text,
  attributes  jsonb,
  PRIMARY KEY (report_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_br_identity ON bug_reports (identity_id);
CREATE INDEX IF NOT EXISTS idx_br_status ON bug_reports (status);

CREATE TABLE IF NOT EXISTS creator_posts (
  post_id     text PRIMARY KEY,
  identity_id text,
  status      text,
  created_at  timestamptz,
  attributes  jsonb
);
CREATE INDEX IF NOT EXISTS idx_cp_identity ON creator_posts (identity_id);
CREATE INDEX IF NOT EXISTS idx_cp_status_created ON creator_posts (status, created_at);

-- ---- writer role (dedicated, least-privilege) --------------------------------------------------------------
-- Create the role with a box-generated password FIRST (out-of-band, NOT committed):
--   CREATE ROLE nasun_bug_report LOGIN PASSWORD '<openssl rand -hex 24>';
--   (or, if already created: ALTER ROLE nasun_bug_report PASSWORD '<...>';)
-- Teardown (after the AWS BugReportStack is gone): DROP OWNED BY nasun_bug_report; DROP ROLE nasun_bug_report;

GRANT CONNECT ON DATABASE nasun_dal TO nasun_bug_report;
GRANT USAGE ON SCHEMA public TO nasun_bug_report;
GRANT SELECT, INSERT, UPDATE, DELETE ON bug_reports, creator_posts TO nasun_bug_report;

-- ---- read role ---------------------------------------------------------------------------------------------
-- Service read pool.
GRANT SELECT ON bug_reports, creator_posts TO nasun_compute_ro;
-- Admin-role check on user_profiles (parity with the referral/leaderboard box admin). dal-reload is stopped
-- (box = SoT), so this grant is stable (no DROP+recreate of user_profiles).
GRANT SELECT ON user_profiles TO nasun_compute_ro;
