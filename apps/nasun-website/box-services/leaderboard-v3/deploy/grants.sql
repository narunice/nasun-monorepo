-- Box nasun_dal grants + indexes for the nasun-leaderboard read service.
-- Run as a superuser/owner: sudo -u postgres psql nasun_dal -f grants.sql
--
-- The Phase 1 dal-load created the lb_* tables owned by nasun_app but did NOT grant the read role
-- (nasun_compute_ro) SELECT on them (verified 2026-06-21: "permission denied for table lb_seasons").
-- These grants are additive + non-destructive. The functional indexes back the by-accountId snapshot
-- lookups (rank-history, get-account recent posts) which otherwise seq-scan the 28k snapshot rows.

GRANT SELECT ON lb_seasons, lb_accounts, lb_season_accounts, lb_snapshots, lb_posts TO nasun_compute_ro;

-- rank-history / get-my-rank: lookups by attributes->>'accountId' across snapshot dates.
CREATE INDEX IF NOT EXISTS idx_lbsnap_account ON lb_snapshots ((attributes->>'accountId'));

-- get-account ?includePosts=true: recent posts by attributes->>'accountId'.
CREATE INDEX IF NOT EXISTS idx_lbpost_account ON lb_posts ((attributes->>'accountId'));

-- ============================================================================
-- Phase 3 cutover only: the snapshot cron writer role (INSERT lb_snapshots + UPDATE lb_seasons).
-- Run when provisioning nasun-leaderboard-snapshot.timer. Reuse nasun_app (owner) or a dedicated role.
-- The read service stays SELECT-only; only the cron writes. Left commented until cutover.
-- ----------------------------------------------------------------------------
-- GRANT INSERT, UPDATE ON lb_snapshots TO <writer-role>;
-- GRANT UPDATE ON lb_seasons TO <writer-role>;
