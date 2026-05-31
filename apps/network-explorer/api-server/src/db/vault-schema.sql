-- Nasun Vault (Phase 5 BP) indexer schema.
--
-- Source of truth for the DDL is `ensureVaultSchema()` in
-- `src/scanner/vault-scanner.ts` (inline CREATE TABLE IF NOT EXISTS, awaited at
-- startup, idempotent). This file is the human-readable mirror kept in sync with
-- that function, following the nsi-schema.sql convention.
--
-- All tables live in the points DB (POINTS_DATABASE_URL) so they survive devnet
-- resets, alongside activity_points / user_nsi.
--
-- Idempotency: every event row carries the chain-unique (tx_digest, event_seq)
-- and inserts use ON CONFLICT DO NOTHING. Monetary amounts (u64/u128) are stored
-- as NUMERIC because u128 exceeds bigint; the `postgres` driver returns NUMERIC
-- as a string, which is the correct lossless JSON representation.

-- One row per vault. Upserted on VaultCreated; mutable columns (NAV, HWM,
-- is_killed) are advanced by later events for the same vault.
CREATE TABLE IF NOT EXISTS vaults (
  vault_id              text PRIMARY KEY,
  manager               text NOT NULL,
  agent_profile_id      text NOT NULL,
  agent_capability_id   text NOT NULL,
  balance_manager_id    text NOT NULL,
  performance_fee_bps   bigint NOT NULL,
  cooldown_ms           bigint NOT NULL,
  initial_seed_nusdc    numeric NOT NULL,
  initial_seed_deep     numeric NOT NULL,
  high_water_mark_nav   numeric,            -- latest crystallized HWM (FeeCrystallized.new_hwm)
  last_nav_per_share    numeric,            -- latest NAV from any nav-bearing event
  last_nav_at_ms        bigint,
  is_killed             boolean NOT NULL DEFAULT false,
  killed_at_ms          bigint,
  created_at_ms         bigint NOT NULL,
  created_tx_digest     text NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- TradeExecuted. Attribution chain (agent_profile_id, capability_id,
-- agent_address, action_type) is carried inline by the event, so no AER lookup
-- is needed. nav_after gives the per-trade NAV series (B.3, RPC 0).
CREATE TABLE IF NOT EXISTS vault_trades (
  tx_digest          text NOT NULL,
  event_seq          bigint NOT NULL,
  vault_id           text NOT NULL,
  agent_profile_id   text NOT NULL,
  capability_id      text NOT NULL,
  agent_address      text NOT NULL,
  pool_id            text NOT NULL,
  is_bid             boolean NOT NULL,
  price              numeric NOT NULL,
  qty                numeric NOT NULL,
  fill_notional      numeric NOT NULL,      -- OrderInfo::cumulative_quote_quantity
  nav_after          numeric NOT NULL,
  action_type        text NOT NULL,         -- decoded from vector<u8>, e.g. nasun_vault.spot_trade
  timestamp_ms       bigint NOT NULL,
  PRIMARY KEY (tx_digest, event_seq)
);
CREATE INDEX IF NOT EXISTS idx_vault_trades_vault_ts
  ON vault_trades(vault_id, timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_vault_trades_agent_profile
  ON vault_trades(agent_profile_id);

-- Deposit / withdraw lifecycle. One table with a flow_type discriminator covers
-- DepositEvent, WithdrawRequested, WithdrawClaimed (normal + emergency).
CREATE TABLE IF NOT EXISTS vault_flows (
  tx_digest          text NOT NULL,
  event_seq          bigint NOT NULL,
  vault_id           text NOT NULL,
  depositor          text NOT NULL,
  flow_type          text NOT NULL,         -- 'deposit' | 'withdraw_requested' | 'withdraw_claimed'
  shares             numeric NOT NULL,
  nusdc_amount       numeric NOT NULL DEFAULT 0,  -- in for deposit, out for claim
  nbtc_amount        numeric NOT NULL DEFAULT 0,  -- out for emergency in-kind claim
  nav_per_share      numeric,
  was_emergency      boolean NOT NULL DEFAULT false,
  cooldown_until_ms  bigint,                -- set for withdraw_requested
  timestamp_ms       bigint NOT NULL,
  PRIMARY KEY (tx_digest, event_seq)
);
CREATE INDEX IF NOT EXISTS idx_vault_flows_vault_ts
  ON vault_flows(vault_id, timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_vault_flows_depositor
  ON vault_flows(vault_id, depositor);

-- FeeCrystallized. Separate table because fee events feed the manager's
-- performance history independent of NAV/trade series.
CREATE TABLE IF NOT EXISTS vault_fee_events (
  tx_digest                     text NOT NULL,
  event_seq                     bigint NOT NULL,
  vault_id                      text NOT NULL,
  manager                       text NOT NULL,
  nav_per_share_at_crystallize  numeric NOT NULL,
  previous_hwm                  numeric NOT NULL,
  new_hwm                       numeric NOT NULL,
  fee_shares_minted             numeric NOT NULL,
  timestamp_ms                  bigint NOT NULL,
  PRIMARY KEY (tx_digest, event_seq)
);
CREATE INDEX IF NOT EXISTS idx_vault_fee_events_vault_ts
  ON vault_fee_events(vault_id, timestamp_ms DESC);

-- Scanner cursor. queryEvents resumes from a {txDigest, eventSeq} cursor, which
-- does not fit processing_state's bigint last_tx_sequence model, so the vault
-- scanner keeps its own single-row cursor.
CREATE TABLE IF NOT EXISTS vault_scan_state (
  id                 int PRIMARY KEY DEFAULT 1,
  cursor_tx_digest   text,                  -- base58 (RPC cursor form), NULL = from genesis
  cursor_event_seq   text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vault_scan_state_singleton CHECK (id = 1)
);
