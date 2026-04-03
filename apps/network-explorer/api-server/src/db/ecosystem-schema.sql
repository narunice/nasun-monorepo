-- Ecosystem Score Schema
-- Run against the nasun_points database (POINTS_DATABASE_URL)

-- 1. Supporting index for the materialized view (if not already present)
-- This speeds up the GROUP BY identity_id, date_trunc('day', tx_timestamp) query.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ap_identity_timestamp
  ON activity_points(identity_id, tx_timestamp);

-- 2. Materialized view: daily ecosystem base scores per identity
-- base_score = number of distinct activity categories per day
-- (e.g., if a user does DEX + lottery + governance in one day, base_score = 3)
--
-- Excluded categories:
--   referral-bonus, daily-mission (system-generated)
--   governance (non-daily; appears as conditional item in Daily Missions)
--   ecosystem-bonus-* (prevent double-counting bonus points)
--
-- Note: 'ecosystem-passive' is intentionally NOT excluded.
-- It counts as a distinct category so Genesis Pass holders get base_score=1 on inactive days.
-- The alliance penalty check uses activity_points directly (excluding ecosystem-passive),
-- so passive points do not prevent penalty detection.
CREATE MATERIALIZED VIEW IF NOT EXISTS ecosystem_daily_scores AS
SELECT
  identity_id,
  date_trunc('day', tx_timestamp)::date AS day,
  COUNT(DISTINCT category) AS base_score
FROM activity_points
WHERE NOT flagged
  AND identity_id IS NOT NULL
  AND category NOT IN ('referral-bonus', 'daily-mission', 'governance')
  AND category NOT LIKE 'ecosystem-bonus-%'
GROUP BY identity_id, date_trunc('day', tx_timestamp)::date;

-- 3. Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_eco_daily_identity_day
  ON ecosystem_daily_scores(identity_id, day);

-- 4. Index for leaderboard queries (sort by score, filter by day range)
CREATE INDEX IF NOT EXISTS idx_eco_daily_day_score
  ON ecosystem_daily_scores(day, base_score DESC);

-- 5. Alliance inactivity penalty tracking
-- Users with alliance-only NFT and <=5 active days in last 7 get penalized.
-- Recovery: 2 consecutive active days -> row deleted.
CREATE TABLE IF NOT EXISTS alliance_penalties (
  identity_id TEXT PRIMARY KEY,
  penalty_start DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
