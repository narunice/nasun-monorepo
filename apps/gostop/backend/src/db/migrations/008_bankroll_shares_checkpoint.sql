-- =============================================================================
-- 008_bankroll_shares_checkpoint.sql
-- =============================================================================
-- Replaces the running `bankroll_event.total_shares_after` total as the basis
-- for chain-vs-DB share divergence detection.
--
-- Why the running total cannot work
--
-- `total_shares_after` is a cumulative sum maintained in insert order, but the
-- ledger is fed by six independent event streams that insert out of order, and
-- the reconciler's scan is gated on a watermark that is the MIN across those
-- streams. To keep the sum monotonic the scan only considers `id > fromId`
-- where fromId is the newest already-reconciled row, so any row held back by
-- the watermark is stepped over and never revisited. Thirteen rows from
-- 2026-06-07..06-20 have been stuck that way, which is what kept
-- `unreconciledShareRows` off zero and muted the divergence alert entirely.
--
-- Separately, `applySharesDelta` treats `shares_seeded` as additive. The v8
-- fresh genesis on 2026-06-19 re-seeded a brand new pool object, so its 100e9
-- seed was added to the retired chain's ~11.3e12 running total instead of
-- starting a new series. That is the whole of the 2.67x gap measured on
-- 2026-09-27: DB 17,895,434,554,337 against chain 6,700,394,818,316.
--
-- Both failures are the same root cause: a cumulative sum from genesis carries
-- every historical discrepancy forever and cannot survive a chain reset.
--
-- What replaces it
--
-- A sum of deltas is order independent; a running total is not. So divergence
-- is checked incrementally from a chain-anchored checkpoint: given the chain
-- share count and the newest event id at the last agreement, the chain's
-- movement since then must equal the summed deltas of the events indexed
-- since then. That detects a missed event within one tick, needs no
-- historically correct series, and makes a chain reset a non-event because a
-- fresh genesis is a new pool object and therefore a new row here.
--
-- Keyed on pool_object_id for exactly that reason. v9 and later reset
-- themselves.
--
-- `total_shares_after` is left in place but retired; a follow-up migration
-- drops it after a soak. Never edit an applied migration (_RESERVED.md rule 3).
-- =============================================================================

CREATE TABLE IF NOT EXISTS gostop.bankroll_shares_checkpoint (
  -- BankrollPool shared-object id this checkpoint belongs to. A fresh genesis
  -- publishes a new pool object, so it gets its own row and its own series.
  pool_object_id TEXT PRIMARY KEY,
  -- Chain `total_shares` at the moment DB and chain last agreed.
  chain_shares   NUMERIC(40,0) NOT NULL,
  -- Newest gostop.bankroll_event id included in that agreement. Deltas are
  -- summed over rows with a greater id.
  last_event_id  BIGINT NOT NULL,
  observed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE gostop.bankroll_shares_checkpoint IS
  'Chain-anchored checkpoint for incremental share divergence detection. One row per BankrollPool object; see migration 008 for why the running total it replaces could not survive a chain reset.';

-- The delta sum runs over (id, event_type) for ids above the checkpoint. The
-- existing PK on id serves the range; this partial index keeps the three
-- share-affecting types cheap to pick out of a table dominated by
-- open_exposure_snapshot rows.
-- CONCURRENTLY because gostop.bankroll_event carries ~4.5M rows and the indexer
-- writes to it continuously; a plain CREATE INDEX takes ACCESS EXCLUSIVE and
-- would stall ingestion for the duration. Run this statement on its own, outside
-- any transaction block, or Postgres rejects it.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bre_share_affecting_id
  ON gostop.bankroll_event (id)
  WHERE event_type IN ('liquidity_provided', 'liquidity_redeemed', 'shares_seeded');

-- Privileges. Mirrors gostop.bankroll_event except DELETE: this table is
-- upsert-only from the app, and re-anchoring a checkpoint by hand is a
-- superuser operation. Default privileges did not cover a table created by
-- postgres, contrary to what migration 004's note assumed, so these are
-- explicit.
GRANT SELECT, INSERT, UPDATE ON gostop.bankroll_shares_checkpoint TO gostop_writer;
GRANT SELECT ON gostop.bankroll_shares_checkpoint TO gostop_reader;
GRANT SELECT ON gostop.bankroll_shares_checkpoint TO sui_indexer;
