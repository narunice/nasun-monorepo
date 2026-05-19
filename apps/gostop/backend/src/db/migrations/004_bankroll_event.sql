-- Gostop backend — migration 004: gostop.bankroll_event ledger.
--
-- Tier 1 LP Pool, Sub-Plan B Tier 1.1 Chunk 2.
-- See apps/gostop/docs/lp-gap-analysis.md §5.2 + ~/.claude/plans/tier1-chunk2-bankroll-pnl-sot.md v3.
--
-- What this stores:
--   Refund / treasury_deposit / LP-flow / admin events from bankroll_pool.move.
--   Bet/payout sides are NOT stored here -- bankrollPnl() derives them via
--   JOIN against gostop.game_round (game_id IN 2..6, status='final') per
--   lp-gap-analysis.md §5.1 (5 games emit collect_bet + pay_winner + GameResult
--   in the same tx, so game_round.bet_amount/payout is byte-equivalent).
--
-- What is NOT stored:
--   pool_balance_after — intentionally absent. The chain's pool.balance is
--   mutated by collect_bet/pay_winner/refund_bet/treasury_deposit/LP flow.
--   Indexing only a subset of those events would silently diverge from chain
--   state. The API reads pool.balance via SuiClient.getObject() at query time
--   (node-3 fullnode colocation = sub-10ms latency). total_shares_after is
--   safe to track here because shares mutate only via LP/seed events, all of
--   which we index. See plan v3 §3.F for the trade-off rationale.
--
-- Apply order (003 pattern, manual):
--   1. As gostop_writer: psql -f 004_bankroll_event.sql (on node-3)
--   2. Restart indexer to pick up cursor reset + new stream handlers.
--
-- Re-run safe: CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, and
-- the BetRefunded cursor DELETE is idempotent (it just allows re-replay of
-- historical events into the new ledger).

-- =============================================================================
-- 1. Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS gostop.bankroll_event (
  id                  BIGSERIAL PRIMARY KEY,
  tx_digest           TEXT NOT NULL,
  event_seq           INT  NOT NULL,
  timestamp_ms        BIGINT NOT NULL,
  -- Plain TEXT; indexer is single writer and validates against a const Set.
  -- Allowed values (indexer-enforced):
  --   bet_refunded, treasury_deposited,
  --   liquidity_provided, withdraw_requested, liquidity_redeemed,
  --   shares_seeded, cap_updated
  event_type          TEXT NOT NULL,
  -- 2..6 for game-attributed events (bet_refunded, treasury_deposited from a
  -- bankroll-aware game). NULL for LP / shares_seeded / cap_updated / admin
  -- treasury deposits and any treasury inflow originating from lottery (which
  -- emits source_game_id=1 but never touches the LP-shared bankroll for
  -- bet/payout; see lp-gap-analysis.md §5.1).
  game_id             SMALLINT NULL CHECK (game_id IS NULL OR game_id BETWEEN 2 AND 6),
  actor               TEXT NULL,
  amount              NUMERIC(30,0) NOT NULL DEFAULT 0,
  shares              NUMERIC(40,0) NULL,
  reason_code         SMALLINT NULL,
  claimable_at_ms     BIGINT NULL,
  -- Indexer-classified discriminator for treasury_deposited events.
  -- Values (indexer-enforced, plain TEXT for forward extensibility):
  --   lottery_treasury_inflow — source_game_id=1 (lottery cut OR unclaimed
  --     sweep, semantically conflated v1).
  --   admin_seed             — source_game_id=0 (seed-bankroll-v2.ts etc).
  --   unknown                — source_game_id outside 0..6 (telemetry breadcrumb).
  treasury_reason     TEXT NULL,
  cap_bps             INT  NULL,
  -- Running snapshot. Reconciler fills this AFTER all PnL streams have
  -- caught up past this row's timestamp (in-memory watermark in
  -- indexer/bankroll-watermark.ts). Within same timestamp_ms, ordering
  -- follows event_type priority (treasury_deposited < bet_refunded < ...
  -- < shares_seeded) to avoid the seed-bootstrap intermediate-row hazard.
  total_shares_after  NUMERIC(40,0) NULL,
  inserted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bankroll_event_tx_seq_uq UNIQUE (tx_digest, event_seq)
);

-- =============================================================================
-- 2. Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_bre_ts
  ON gostop.bankroll_event (timestamp_ms);

-- bankrollPnl() SUM by (event_type, time window).
CREATE INDEX IF NOT EXISTS idx_bre_type_ts
  ON gostop.bankroll_event (event_type, timestamp_ms);

-- Per-actor lookups (future LP positions endpoint, Tier 1.2).
CREATE INDEX IF NOT EXISTS idx_bre_actor_ts
  ON gostop.bankroll_event (actor, timestamp_ms DESC)
  WHERE actor IS NOT NULL;

-- Reconciler scan: rows still missing total_shares_after, ordered exactly
-- as the reconciler's ORDER BY clause expects (timestamp_ms, id).
CREATE INDEX IF NOT EXISTS idx_bre_unsnapshotted
  ON gostop.bankroll_event (timestamp_ms, id)
  WHERE total_shares_after IS NULL;

COMMENT ON TABLE gostop.bankroll_event IS
  'BankrollPool refund + treasury + LP event log. Tracks total_shares running snapshot for share_price queries; pool.balance read from chain at query time. See apps/gostop/docs/lp-gap-analysis.md §5.2 and ~/.claude/plans/tier1-chunk2-bankroll-pnl-sot.md v3 §3.';

-- =============================================================================
-- 3. BetRefunded cursor reset
-- =============================================================================
-- The existing bankroll_pool::BetRefunded stream advanced its cursor to "now"
-- while it was a breadcrumb-only handler. To replay historical refunds into
-- the new ledger, delete the cursor row. The new handler is idempotent
-- (ON CONFLICT DO NOTHING on (tx_digest, event_seq)) so re-processing is safe.
--
-- This MUST run BEFORE the new indexer code starts, otherwise the old code
-- (or partially-replaced code) will advance past historical events without
-- writing them to bankroll_event. Embedding the DELETE in this migration
-- file makes the schema upgrade and cursor replay atomic: psql -f applies
-- both as a single SQL session.

DELETE FROM gostop.indexer_cursor
 WHERE stream = 'bankroll_pool::BetRefunded';
