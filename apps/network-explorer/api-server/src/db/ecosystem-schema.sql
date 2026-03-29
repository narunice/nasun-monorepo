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
--   referral-bonus, daily-mission, wallet-transfer (system/spam-prone)
--   ecosystem-bonus-* (prevent double-counting bonus points)
CREATE MATERIALIZED VIEW IF NOT EXISTS ecosystem_daily_scores AS
SELECT
  identity_id,
  date_trunc('day', tx_timestamp)::date AS day,
  COUNT(DISTINCT category) AS base_score
FROM activity_points
WHERE NOT flagged
  AND identity_id IS NOT NULL
  AND category NOT IN (
    'referral-bonus',
    'daily-mission',
    'wallet-transfer',
    'ecosystem-bonus-pnl',
    'ecosystem-bonus-rank',
    'ecosystem-bonus-game',
    'ecosystem-bonus-diversity'
  )
GROUP BY identity_id, date_trunc('day', tx_timestamp)::date;

-- 3. Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_eco_daily_identity_day
  ON ecosystem_daily_scores(identity_id, day);

-- 4. Index for leaderboard queries (sort by score, filter by day range)
CREATE INDEX IF NOT EXISTS idx_eco_daily_day_score
  ON ecosystem_daily_scores(day, base_score DESC);
