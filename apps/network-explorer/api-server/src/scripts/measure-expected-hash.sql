-- ARCHIVAL: hash uses original 2026-04 weights at time of capture.
-- DO NOT MODIFY the CASE WHEN category='pado-dex' THEN 2 expression — this
-- script must reproduce the byte-identical hash of restore-staking-recovery.sql
-- as it was when run. Heavy-base category set has expanded to include
-- pado-prediction (see config/points.ts:HEAVY_BASE_CATEGORIES); applying that
-- newer weight here would corrupt the hash invariant.
--
-- measure-expected-hash.sql
-- Measures the expected diff_hash for restore-staking-recovery.sql
-- Must be byte-identical (for _deltas construction) with the recovery SQL.
-- Run:  sudo -u postgres psql -d nasun_points -tAX \
--         -c "SET timezone='UTC'; $(cat measure-expected-hash.sql)"
--
-- Category filter: ecosystem base_score scope (see db/ecosystem-schema.sql).
-- `staking` is not in NOT IN list because it's excluded via the
-- time-bounded clause below (pre-2026-04-12 counts, post doesn't).

WITH cats AS (
  SELECT DISTINCT identity_id, date_trunc('day', tx_timestamp)::date AS day, category
  FROM activity_points
  WHERE NOT flagged AND identity_id IS NOT NULL
    AND category NOT IN ('referral-bonus','daily-mission','ecosystem-passive','staking-daily')
    AND category NOT LIKE 'ecosystem-bonus-%'
    AND tx_timestamp >= '2026-04-01'::timestamptz
    AND (category <> 'staking' OR tx_timestamp < '2026-04-12 00:00:00+00'::timestamptz)
),
w AS (
  SELECT identity_id, day,
         CASE WHEN category='pado-dex' THEN 2 ELSE 1 END AS wt,
         (category='staking') AS is_st
  FROM cats
),
d AS (
  SELECT identity_id, day,
         SUM(wt) - COALESCE(SUM(wt) FILTER (WHERE NOT is_st), 0) AS delta
  FROM w GROUP BY identity_id, day
  HAVING SUM(wt) - COALESCE(SUM(wt) FILTER (WHERE NOT is_st), 0) > 0
)
SELECT md5(string_agg(identity_id || ':' || day || ':' || delta,
                      ',' ORDER BY identity_id COLLATE "C", day))
FROM d;
