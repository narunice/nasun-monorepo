-- Ecosystem Score Schema
-- Run against the nasun_points database (POINTS_DATABASE_URL)

-- 1. Supporting index for the materialized view (if not already present)
-- This speeds up the GROUP BY identity_id, date_trunc('day', tx_timestamp) query.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ap_identity_timestamp
  ON activity_points(identity_id, tx_timestamp);

-- 1b. Composite index for weekly leaderboard direct queries on activity_points.
-- Covers: tx_timestamp range scan + category filter + flagged exclusion.
-- Used by: GET /ecosystem/leaderboard (weekly score aggregation, no matview).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ap_timestamp_category_flagged
  ON activity_points(tx_timestamp, category)
  WHERE NOT flagged AND identity_id IS NOT NULL;

-- ⚠ SCHEMA CHANGES TO THE MATVIEW BELOW DO NOT AUTO-APPLY ⚠
-- CREATE MATERIALIZED VIEW has no OR REPLACE form and the IF NOT EXISTS
-- clause short-circuits when the view already exists. The scanner's DB role
-- also lacks CREATE privilege on schema public, so runtime DDL from the
-- application is not an option. To change the formula:
--   1. Update ecosystem-matview-migration.ts (MATVIEW_SQL + bump MATVIEW_VERSION)
--   2. Update this file to match (canonical source for humans)
--   3. Deploy code. Scanner logs a version-mismatch WARN on boot.
--   4. A DB superuser runs the migration CLI (pnpm build &&
--      node dist/db/ecosystem-matview-migration.js) or equivalent psql.
--
-- 2. Materialized view: daily ecosystem base scores per identity
-- base_score = weighted sum of distinct activity categories per day
-- Most categories count as 1; pado-dex counts as 2 (higher commitment).
-- (e.g., if a user does DEX + lottery + governance in one day, base_score = 4)
--
-- Excluded categories (unified with daily-nft-check.ts EXCLUDED_CATEGORIES):
--   referral-bonus, daily-mission (system-generated bonuses)
--   ecosystem-passive (Genesis Pass auto-grant, not real user activity)
--   staking-daily (auto-grant for maintaining active stakes)
--   ecosystem-bonus-* (prevent double-counting bonus points)
--
-- NOT excluded (counts as real user activity):
--   governance (voting/delegation is active participation)
--   wallet-transfer (user-initiated token transfers)
--   faucet, pado-*, baram-* (on-chain actions)
--   staking: excluded from base_score, planned for independent scoring system
--
-- Weight override: pado-dex = 2 (matches DailyMissionsCard UI points)
CREATE MATERIALIZED VIEW IF NOT EXISTS ecosystem_daily_scores AS
WITH distinct_cats AS (
  SELECT DISTINCT
    identity_id,
    date_trunc('day', tx_timestamp)::date AS day,
    category
  FROM activity_points
  WHERE NOT flagged
    AND identity_id IS NOT NULL
    AND category NOT IN ('referral-bonus', 'daily-mission', 'ecosystem-passive', 'staking-daily', 'staking')
    AND category NOT LIKE 'ecosystem-bonus-%'
)
SELECT
  identity_id,
  day,
  SUM(CASE WHEN category = 'pado-dex' THEN 2 ELSE 1 END)::int AS base_score
FROM distinct_cats
GROUP BY identity_id, day;

-- 3. Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_eco_daily_identity_day
  ON ecosystem_daily_scores(identity_id, day);

-- 4. Index for leaderboard queries (sort by score, filter by day range)
CREATE INDEX IF NOT EXISTS idx_eco_daily_day_score
  ON ecosystem_daily_scores(day, base_score DESC);

-- 5. Ensure matview is owned by sui_indexer (required for REFRESH CONCURRENTLY)
ALTER MATERIALIZED VIEW ecosystem_daily_scores OWNER TO sui_indexer;

-- 6. Alliance inactivity penalty tracking
-- Users with alliance-only NFT and <=5 active days in last 7 get penalized.
-- Recovery: 2 consecutive active days -> row deleted.
CREATE TABLE IF NOT EXISTS alliance_penalties (
  identity_id TEXT PRIMARY KEY,
  penalty_start DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_seen DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 7. Alliance NFT first activation tracking (for grace period logic).
-- Records the earliest activity_points date for each alliance-only user.
-- Persists across alliance_penalties DELETE (recovery), so grace is only
-- applied once: when the user first activates Alliance NFT.
-- Populated by daily-nft-check.ts via INSERT ... ON CONFLICT DO NOTHING.
CREATE TABLE IF NOT EXISTS alliance_first_seen (
  identity_id TEXT PRIMARY KEY,
  first_seen DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 8. V2 NFT health state: per-(identity, nft_type) health percentage.
-- Populated by daily-nft-check.ts after ECO_HEALTH_V2_CUTOFF is set.
-- Pre-cutover: table stays empty; V1 paths read alliance_penalties instead.
CREATE TABLE IF NOT EXISTS nft_health_state (
  identity_id           TEXT NOT NULL,
  nft_type              TEXT NOT NULL,          -- 'alliance' | 'genesis-pass'
  health_pct            NUMERIC(5,2) NOT NULL,  -- 0, 12.5, 25, 50, 100
  consecutive_rest_days INT NOT NULL DEFAULT 0,
  last_active_day       DATE,
  last_evaluated_day    DATE NOT NULL,          -- most recent health update (UTC day)
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (identity_id, nft_type)
);
