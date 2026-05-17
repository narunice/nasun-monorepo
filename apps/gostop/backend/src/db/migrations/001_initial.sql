-- Gostop backend — initial schema migration
-- Target DB: nasun_points (shared with explorer-api ecosystem points system)
-- Schema: gostop (isolated; explorer artifacts in public schema untouched)
--
-- Apply order:
--   1. As DB superuser (or owner of nasun_points): run sections 1-2 (schema + roles).
--   2. As gostop_writer or owner: run sections 3-5 (tables, indexes, matviews).
--
-- This script is idempotent (CREATE IF NOT EXISTS / safeguards), suitable for re-run.

-- =============================================================================
-- 1. Schema
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gostop;

COMMENT ON SCHEMA gostop IS
  'Gostop casino backend (Tier 0+): per-round bet ledger, leaderboard, dashboard. Isolated from explorer activity_points.';

-- =============================================================================
-- 2. Roles (run as superuser; idempotent guard)
-- =============================================================================
-- Passwords are placeholders. Set via:
--   ALTER ROLE gostop_writer PASSWORD '<from .env>';
--   ALTER ROLE gostop_reader PASSWORD '<from .env>';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gostop_writer') THEN
    CREATE ROLE gostop_writer LOGIN PASSWORD 'CHANGE_ME_WRITER'
      CONNECTION LIMIT 20;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gostop_reader') THEN
    CREATE ROLE gostop_reader LOGIN PASSWORD 'CHANGE_ME_READER'
      CONNECTION LIMIT 30;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA gostop TO gostop_writer, gostop_reader;
GRANT ALL ON ALL TABLES IN SCHEMA gostop TO gostop_writer;
GRANT ALL ON ALL SEQUENCES IN SCHEMA gostop TO gostop_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA gostop TO gostop_reader;

ALTER DEFAULT PRIVILEGES IN SCHEMA gostop
  GRANT ALL ON TABLES TO gostop_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA gostop
  GRANT ALL ON SEQUENCES TO gostop_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA gostop
  GRANT SELECT ON TABLES TO gostop_reader;

-- Cross-schema read access for ecosystem points integration (gostop_reader only).
-- gostop_writer intentionally has NO access to public schema artifacts —
-- preserves integrity-guard protection on activity_points.
--
-- Note: identity_id ↔ wallet mapping is not a Postgres table on node-3 (lives
-- in DynamoDB UserProfiles in the nasun-website backend). Cross-references
-- from gostop wallet -> identity_id will use a small lookup helper at the
-- API layer rather than a SQL join. We therefore grant SELECT only on the
-- four Postgres-resident tables the User Dashboard actually needs.
GRANT USAGE ON SCHEMA public TO gostop_reader;
GRANT SELECT ON public.activity_points TO gostop_reader;
GRANT SELECT ON public.nft_health_state TO gostop_reader;
GRANT SELECT ON public.user_active_missions TO gostop_reader;
GRANT SELECT ON public.ecosystem_score_snapshots TO gostop_reader;

-- =============================================================================
-- 3. Canonical tables
-- =============================================================================

-- 3.1 game_round — single ledger row per game result (Tier 0 SoT)
CREATE TABLE IF NOT EXISTS gostop.game_round (
  id              BIGSERIAL PRIMARY KEY,
  tx_digest       TEXT NOT NULL,
  event_seq       INT NOT NULL,
  game_id         SMALLINT NOT NULL,
  player          TEXT NOT NULL,
  bet_amount      NUMERIC(30,0) NOT NULL,
  payout          NUMERIC(30,0) NOT NULL DEFAULT 0,
  multiplier_bps  BIGINT NOT NULL DEFAULT 0,
  session_id      BYTEA NOT NULL,
  timestamp_ms    BIGINT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'final',
  inserted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT game_round_tx_seq_uq UNIQUE (tx_digest, event_seq),
  CONSTRAINT game_round_game_id_range CHECK (game_id BETWEEN 1 AND 6),
  CONSTRAINT game_round_status_valid CHECK (status IN (
    'final','pending_resolve','pending_claim','unclaimed_expired','refunded'
  ))
);

CREATE INDEX IF NOT EXISTS idx_gr_player_ts
  ON gostop.game_round (player, timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_gr_game_ts
  ON gostop.game_round (game_id, timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_gr_whale_ts
  ON gostop.game_round (timestamp_ms DESC)
  WHERE payout >= 500000000;            -- partial idx, ≥ 500 USDC payout (6 decimals)
CREATE INDEX IF NOT EXISTS idx_gr_status
  ON gostop.game_round (status, timestamp_ms DESC)
  WHERE status <> 'final';

COMMENT ON TABLE gostop.game_round IS
  'Per-round canonical bet ledger. See apps/gostop/docs/game-result-schema.md';

-- 3.2 indexer_cursor — per-stream checkpoint
CREATE TABLE IF NOT EXISTS gostop.indexer_cursor (
  stream      TEXT PRIMARY KEY,
  last_tx     TEXT,
  last_seq    INT,
  last_ts_ms  BIGINT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 user_settings — feed visibility, etc. (Tier 0.1 whale transparency)
CREATE TABLE IF NOT EXISTS gostop.user_settings (
  player           TEXT PRIMARY KEY,
  feed_visibility  TEXT NOT NULL DEFAULT 'public',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_visibility_valid CHECK (feed_visibility IN (
    'public','anonymous','delayed','opt-out'
  ))
);

-- 3.4 Lottery-specific synthesized tables (B안, schema doc §4)
CREATE TABLE IF NOT EXISTS gostop.lottery_round (
  round_number          BIGINT PRIMARY KEY,
  round_id              TEXT NOT NULL,
  draw_time_ms          BIGINT NOT NULL,
  close_time_ms         BIGINT NOT NULL,
  drawn_numbers         SMALLINT[],
  drawn_at_ms           BIGINT,
  settled               BOOLEAN NOT NULL DEFAULT false,
  tier1_payout          NUMERIC(30,0),
  tier2_payout          NUMERIC(30,0),
  tier3_payout          NUMERIC(30,0),
  tier1_winners         INT,
  tier2_winners         INT,
  tier3_winners         INT,
  treasury_amount       NUMERIC(30,0),
  claim_deadline_ms     BIGINT,
  fully_claimed_at_ms   BIGINT,
  inserted_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gostop.lottery_ticket (
  round_number     BIGINT NOT NULL REFERENCES gostop.lottery_round(round_number),
  ticket_id        BIGINT NOT NULL,
  buyer            TEXT NOT NULL,
  numbers          SMALLINT[] NOT NULL,
  bet_amount       NUMERIC(30,0) NOT NULL,
  purchase_tx      TEXT NOT NULL,
  purchase_seq     INT NOT NULL,
  purchase_ts_ms   BIGINT NOT NULL,
  match_count      SMALLINT,
  tier             SMALLINT,
  expected_payout  NUMERIC(30,0),
  claim_tx         TEXT,
  claim_ts_ms      BIGINT,
  claimed_payout   NUMERIC(30,0),
  status           TEXT NOT NULL DEFAULT 'pending_resolve',
  PRIMARY KEY (round_number, ticket_id),
  CONSTRAINT lottery_ticket_status_valid CHECK (status IN (
    'pending_resolve','pending_claim','final','unclaimed_expired'
  ))
);

CREATE INDEX IF NOT EXISTS idx_lt_buyer
  ON gostop.lottery_ticket (buyer, purchase_ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_lt_pending
  ON gostop.lottery_ticket (round_number)
  WHERE status IN ('pending_resolve','pending_claim');

-- 3.5 Crash-specific synthesized tables (schema doc §5)
CREATE TABLE IF NOT EXISTS gostop.crash_round (
  round_id          BIGINT PRIMARY KEY,
  start_tx          TEXT NOT NULL,
  start_ts_ms       BIGINT NOT NULL,
  commit_hash       BYTEA NOT NULL,
  resolved          BOOLEAN NOT NULL DEFAULT false,
  resolve_tx        TEXT,
  resolve_ts_ms     BIGINT,
  crash_point_bps   BIGINT,
  crash_time_ms     BIGINT,
  salt              BYTEA,
  total_bet         NUMERIC(30,0),
  total_payout      NUMERIC(30,0),
  cashout_count     INT,
  refunded          BOOLEAN NOT NULL DEFAULT false,
  commit_verified   BOOLEAN,                 -- NULL until resolve; false = ALERT
  inserted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gostop.crash_cashout (
  round_id          BIGINT NOT NULL REFERENCES gostop.crash_round(round_id),
  player            TEXT NOT NULL,
  cashout_mul_bps   BIGINT NOT NULL,
  cashout_ts_ms     BIGINT NOT NULL,
  PRIMARY KEY (round_id, player)
);

-- =============================================================================
-- 4. Materialized views (aggregations for API)
-- =============================================================================

-- 4.1 player_stats — per-player lifetime aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS gostop.player_stats AS
SELECT
  player,
  COUNT(*)::bigint                       AS rounds,
  COALESCE(SUM(bet_amount), 0)           AS total_bet,
  COALESCE(SUM(payout), 0)               AS total_payout,
  COALESCE(SUM(payout) - SUM(bet_amount), 0) AS net_pnl,
  MAX(timestamp_ms)                      AS last_played_ms
FROM gostop.game_round
WHERE status = 'final'
GROUP BY player;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_player
  ON gostop.player_stats (player);
CREATE INDEX IF NOT EXISTS idx_ps_pnl
  ON gostop.player_stats (net_pnl DESC);

-- 4.2 game_daily — per-game-per-day aggregates for RTP / transparency
CREATE MATERIALIZED VIEW IF NOT EXISTS gostop.game_daily AS
SELECT
  game_id,
  date_trunc('day', to_timestamp(timestamp_ms / 1000.0))::date AS day,
  COUNT(*)::bigint                       AS rounds,
  COALESCE(SUM(bet_amount), 0)           AS total_bet,
  COALESCE(SUM(payout), 0)               AS total_payout,
  CASE
    WHEN SUM(bet_amount) > 0 THEN (SUM(payout)::numeric / SUM(bet_amount))
    ELSE 0
  END                                    AS rtp_realized
FROM gostop.game_round
WHERE status IN ('final','unclaimed_expired')
GROUP BY game_id, day;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gd_game_day
  ON gostop.game_daily (game_id, day);

-- REFRESH cadence (operated by gostop-indexer cron, UTC 03:00-04:00 off-peak):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY gostop.player_stats;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY gostop.game_daily;
-- v0 interval: 10min during peak hours, hourly off-peak. Adjust after observation.

-- =============================================================================
-- 5. Sanity / final grants (handles tables created AFTER role setup)
-- =============================================================================

GRANT ALL ON ALL TABLES IN SCHEMA gostop TO gostop_writer;
GRANT ALL ON ALL SEQUENCES IN SCHEMA gostop TO gostop_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA gostop TO gostop_reader;
