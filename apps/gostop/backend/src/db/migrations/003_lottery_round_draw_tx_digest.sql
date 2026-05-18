-- Gostop backend — migration 003: lottery_round.draw_tx_digest column.
--
-- Why this migration exists:
--   Migration 001 created gostop.lottery_round without `draw_tx_digest`, but
--   three consumers reference it:
--     1. indexer/streams/lottery.ts `tickLotteryNumbersDrawn` INSERT/UPDATE
--        (would crash the indexer the first time a NumbersDrawn event lands)
--     2. api/routes/transparency.ts `/lottery/draws` SELECT
--        (returns HTTP 500 on every call)
--     3. frontend TransparencyPage TxLink + the PR-5 ReplayPage tx digest link
--        ("View draw transaction" never renders)
--   Detected during Tier 0 e2e verification (2026-05-18) before any prod
--   indexer run, so no backfill is required for existing rows.
--
-- Apply order:
--   1. As gostop_writer (or owner of gostop.lottery_round): run section 1.
--
-- Re-run safe: ADD COLUMN IF NOT EXISTS skips when the column already exists.

-- =============================================================================
-- 1. Column
-- =============================================================================

ALTER TABLE gostop.lottery_round
  ADD COLUMN IF NOT EXISTS draw_tx_digest TEXT;

COMMENT ON COLUMN gostop.lottery_round.draw_tx_digest IS
  'Sui tx digest of the NumbersDrawn event for this round. Powers the TransparencyPage / ReplayPage "View draw transaction" link. NULL until NumbersDrawn is indexed.';
