-- On-Chain Activity Points System
-- Database: nasun_points (separate from sui_indexer, survives devnet resets)
-- Run on node-3: psql -U postgres -c "CREATE DATABASE nasun_points;"
-- Then: psql -U postgres -d nasun_points -f points-schema.sql

-- Individual activity records
CREATE TABLE activity_points (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  identity_id TEXT,
  tx_digest TEXT NOT NULL,
  tx_sequence_number BIGINT NOT NULL,
  category TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  base_points NUMERIC NOT NULL,
  volume_tier NUMERIC NOT NULL DEFAULT 1.0,
  genesis_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  final_points NUMERIC NOT NULL,
  tx_timestamp TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  event_seq INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tx_digest, activity_type, event_seq)
);

CREATE INDEX idx_ap_wallet ON activity_points(wallet_address);
CREATE INDEX idx_ap_identity_points ON activity_points(identity_id, final_points);
CREATE INDEX idx_ap_timestamp ON activity_points(tx_timestamp);
CREATE INDEX idx_ap_category ON activity_points(category);
CREATE INDEX idx_ap_tx_seq ON activity_points(tx_sequence_number);

-- Scanner processing state
CREATE TABLE processing_state (
  scanner_id TEXT PRIMARY KEY DEFAULT 'main',
  last_tx_sequence BIGINT NOT NULL DEFAULT 0,
  chain_genesis_hash TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_count BIGINT DEFAULT 0
);

-- Initialize main scanner
INSERT INTO processing_state (scanner_id) VALUES ('main');

-- Staking emission state: tracks last seen estimatedReward per identity
-- for delta computation in awardStakingEmissions().
-- NUMERIC avoids BigInt precision loss for large MIST values.
CREATE TABLE IF NOT EXISTS staking_emission_state (
  identity_id TEXT PRIMARY KEY,
  last_total_mist NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
