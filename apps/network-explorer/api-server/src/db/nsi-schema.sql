-- ============================================================================
-- NSI (Nasun Standing Index) Schema — Phase 1 v3
--
-- Target: POINTS_DATABASE on node-3.
-- Idempotent migration (IF NOT EXISTS). Apply via:
--   psql "$POINTS_DATABASE_URL" -f nsi-schema.sql
--
-- Tables introduced (all new — no existing table touched):
--   user_nsi                       — current NSI score + derived tier per identity
--   user_staking_daily_snapshots   — 30-day sliding window of staking principal
--   user_lp_daily_snapshots        — 30-day sliding window of LP USD value
--
-- Not affected by points-integrity-guard trigger (which protects activity_points
-- only). UPDATE/UPSERT on these tables is intentional — tier and NSI fluctuate
-- with the sliding window.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_nsi (
    identity_id        text PRIMARY KEY,
    wallet_address     text NOT NULL,
    tier               smallint NOT NULL CHECK (tier IN (1, 2, 3)),
    previous_tier      smallint CHECK (previous_tier IN (0, 1, 2, 3)),
    max_seen_tier      smallint NOT NULL CHECK (max_seen_tier IN (1, 2, 3)),
    nsi_score          numeric(7, 2) NOT NULL,
    sub_scores         jsonb NOT NULL,
    has_gp             boolean NOT NULL DEFAULT false,
    first_computed_at  timestamptz NOT NULL DEFAULT now(),
    computed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_nsi_tier
    ON user_nsi(tier);
CREATE INDEX IF NOT EXISTS idx_user_nsi_computed_at
    ON user_nsi(computed_at);
CREATE INDEX IF NOT EXISTS idx_user_nsi_wallet_lower
    ON user_nsi(LOWER(wallet_address));

CREATE TABLE IF NOT EXISTS user_staking_daily_snapshots (
    identity_id       text NOT NULL,
    day               date NOT NULL,
    staked_nsn_mist   numeric(30, 0) NOT NULL,
    captured_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (identity_id, day)
);

CREATE INDEX IF NOT EXISTS idx_user_staking_daily_day
    ON user_staking_daily_snapshots(day);

CREATE TABLE IF NOT EXISTS user_lp_daily_snapshots (
    identity_id       text NOT NULL,
    day               date NOT NULL,
    venue             text NOT NULL,
    lp_usd            numeric(18, 4) NOT NULL,
    captured_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (identity_id, day, venue)
);

CREATE INDEX IF NOT EXISTS idx_user_lp_daily_day
    ON user_lp_daily_snapshots(day);

-- Phase 4 v3: tier-push tracking. `last_pushed_tier` is the canonical diff
-- marker between off-chain user_nsi.tier and the on-chain TierRegistry.
-- NULL means "never pushed", which the worker treats as TIER_1 (the on-chain
-- default returned by `tier::get` when an address is absent from the table).
-- `last_pushed_at` is intentionally omitted; re-add if/when stale-push
-- alerting needs a wallclock signal.
ALTER TABLE user_nsi
    ADD COLUMN IF NOT EXISTS last_pushed_tier smallint;
