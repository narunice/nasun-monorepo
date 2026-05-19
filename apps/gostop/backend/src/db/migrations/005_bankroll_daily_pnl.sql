-- =============================================================================
-- 005_bankroll_daily_pnl.sql — Tier 1.3 Risk Dashboard matview
-- =============================================================================
-- Purpose: per-UTC-day aggregation of BankrollPool flows (game_id 2..6 only),
-- joined from gostop.game_round (bets/payouts) and gostop.bankroll_event
-- (refunds/treasury). Backs three Risk Dashboard metrics:
--   - max_drawdown_pct  (running peak vs current via window fn at query time)
--   - daily_pnl_volatility_30d  (STDDEV over last 30 rows)
--   - longest_house_losing_streak  (max consecutive days where net_pnl < 0)
--
-- Lottery (game_id=1) is intentionally excluded. Lottery PnL flows through
-- its own prize_pool, never the LP-shared bankroll, per lp-gap-analysis §5.1.
--
-- A FULL OUTER JOIN on day is used so days with refunds-only (no settled
-- rounds) still produce a row with bets/payouts=0. The matview's UNIQUE
-- INDEX is the REFRESH MATERIALIZED VIEW CONCURRENTLY precondition.
--
-- Refresh cadence: managed by indexer/matview-refresh.ts under advisory lock
-- key 91_003 (W5 reservation 91_003-91_009 for Risk Dashboard matviews).
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS gostop.bankroll_daily_pnl AS
WITH gr AS (
  SELECT
    date_trunc('day', to_timestamp(timestamp_ms / 1000.0))::date AS day,
    COALESCE(SUM(bet_amount), 0)        AS bets_raw,
    COALESCE(SUM(payout), 0)            AS payouts_raw,
    COUNT(*)::bigint                    AS rounds,
    COUNT(DISTINCT player)::bigint      AS players
  FROM gostop.game_round
  WHERE status = 'final'
    AND game_id BETWEEN 2 AND 6
  GROUP BY day
),
br AS (
  SELECT
    date_trunc('day', to_timestamp(timestamp_ms / 1000.0))::date AS day,
    COALESCE(SUM(amount) FILTER (
      WHERE event_type = 'bet_refunded'
        AND game_id BETWEEN 2 AND 6
    ), 0) AS refunds_raw,
    COALESCE(SUM(amount) FILTER (
      WHERE event_type = 'treasury_deposited'
    ), 0) AS treasury_inflow_raw
  FROM gostop.bankroll_event
  GROUP BY day
)
SELECT
  COALESCE(gr.day, br.day)                    AS day,
  COALESCE(gr.bets_raw, 0)                    AS bets_raw,
  COALESCE(gr.payouts_raw, 0)                 AS payouts_raw,
  COALESCE(br.refunds_raw, 0)                 AS refunds_raw,
  COALESCE(br.treasury_inflow_raw, 0)         AS treasury_inflow_raw,
  -- Net PnL: bets - payouts - refunds. Treasury inflow is capital, not PnL.
  (COALESCE(gr.bets_raw, 0)
   - COALESCE(gr.payouts_raw, 0)
   - COALESCE(br.refunds_raw, 0))             AS net_pnl_raw,
  COALESCE(gr.rounds, 0)                      AS rounds,
  COALESCE(gr.players, 0)                     AS players
FROM gr
FULL OUTER JOIN br ON gr.day = br.day;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bdp_day
  ON gostop.bankroll_daily_pnl (day);

COMMENT ON MATERIALIZED VIEW gostop.bankroll_daily_pnl IS
  'Per-day BankrollPool flows (game_id 2..6, lottery excluded). Backs Risk Dashboard drawdown/volatility/streak. See ~/.claude/plans/tier1-chunk3-risk-dashboard.md.';

GRANT SELECT ON gostop.bankroll_daily_pnl TO gostop_reader;
