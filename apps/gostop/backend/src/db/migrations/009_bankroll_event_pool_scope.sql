-- =============================================================================
-- 009_bankroll_event_pool_scope.sql
-- =============================================================================
-- Adds `pool_object_id` to gostop.bankroll_event so LP share aggregates can be
-- scoped to one BankrollPool object, and backfills it for the share-affecting
-- event types.
--
-- Why
--
-- `gostop.bankroll_event` spans two chains. The v8 fresh genesis on 2026-06-19
-- published a new BankrollPool object, but the ledger kept accumulating into
-- the same table with no column identifying which pool a row belongs to.
-- Migration 008 fixed divergence detection by keying its checkpoint on
-- pool_object_id and summing deltas instead of history. The LP share
-- aggregates were never migrated to that discipline and still scan the table
-- from genesis, so they mix the retired chain's positions into live figures:
--
--   retired pool net shares (incl. seed) : 11,308,227,383,278
--   v8 pool net shares      (incl. seed) :  6,821,569,984,084
--   chain total_shares on 2026-10-12     :  6,804,243,847,676
--
-- The 11.3e12 figure is the same retired-chain total migration 008 identified
-- as the whole of its 2.67x gap. Measured consequences on 2026-10-12, all of
-- them live on the public transparency page:
--
--   lp_count            377 reported,  215 real
--   rank-1 share     57.28% reported, 54.28% real
--   rank-4 identity  a wallet with no live position, displacing the real one
--   162 wallets  shown a phantom LP position that does not exist on chain
--   107 wallets  shown an inflated share count
--
-- The phantom positions are the reason this is a correctness fix and not a
-- cosmetic one: `me/lp/position` told 162 wallets they held shares they cannot
-- redeem, because no LPToken for them exists on the live chain.
--
-- Era boundary
--
-- `shares_seeded` is a one-shot per pool (seed lock, bankroll_pool.move v0.0.3),
-- so the v8 pool's seed event is its first event and an exact era start:
--
--   retired pool seed : id       6, timestamp_ms 1779102151172 (2026-05-18)
--   v8 pool seed      : id 1773092, timestamp_ms 1781869218280 (2026-06-19)
--
-- The boundary is a timestamp, not an id. `id` is BIGSERIAL in insert order and
-- the streams insert out of order behind a MIN watermark, so ids are not
-- monotonic in event time across the cutover (id 1773092 at 11:40 UTC was
-- inserted after id 1748453 at 12:18 UTC). Splitting on id would misclassify
-- rows on both sides. Event timestamps come from chain and do not have that
-- problem: the retired chain's clock stops at the reset.
--
-- Scope of the backfill
--
-- Only the three share-affecting event types are stamped. Measured 2026-10-12:
-- 2,546 such rows against 4,921,339 total, of which 4,918,415 are
-- open_exposure_snapshot. No era-scoped query reads those: every exposure
-- consumer takes the newest row, which is era-safe by construction. Rewriting
-- millions of rows for a column nobody filters on would cost a multi-GB churn
-- on a box that shares its disk with the validator, for no read benefit.
--
-- So `pool_object_id IS NULL` means "not a share-affecting row", not "unknown
-- era". A CHECK encoding that biconditional is deliberately NOT added here:
-- per the first-deploy checklist this migration is applied BEFORE the backend
-- that stamps the column, so the running indexer would violate it immediately.
-- Reserved as 010, to be added after the backend is live and the catch-up
-- backfill in the deploy checklist reports zero unstamped share rows.
--
-- Deploy order, and why re-running this file is the catch-up step
--
-- Apply this BEFORE deploying the backend, per the migration-first-deploy
-- checklist. Between that apply and the deploy, the running indexer does not
-- know the column and writes NULL into it, so any LP event landing in that
-- window would be invisible to the newly scoped aggregates.
--
-- Every statement here is idempotent: ADD COLUMN IF NOT EXISTS, both UPDATEs
-- guarded on `pool_object_id IS NULL`, CREATE INDEX IF NOT EXISTS. So the
-- catch-up is simply running this file again after the backend is live. It
-- cannot reassign a row the new indexer has already stamped, and no new row
-- can fall on the retired side of the boundary. Confirm it is settled with:
--
--   SELECT count(*) FROM gostop.bankroll_event
--    WHERE event_type IN ('liquidity_provided','liquidity_redeemed','shares_seeded')
--      AND pool_object_id IS NULL;   -- expect 0
--
-- If CREATE INDEX CONCURRENTLY is interrupted it leaves an invalid index
-- behind, and IF NOT EXISTS will then skip rebuilding it. Check before
-- trusting the index:
--
--   SELECT indisvalid FROM pg_index
--    WHERE indexrelid = 'gostop.idx_bre_lp_pool_actor'::regclass;  -- expect t
--
-- Drop and recreate if it comes back false.
--
-- Never edit an applied migration (_RESERVED.md rule 3).
-- =============================================================================

ALTER TABLE gostop.bankroll_event
  ADD COLUMN IF NOT EXISTS pool_object_id TEXT NULL;

COMMENT ON COLUMN gostop.bankroll_event.pool_object_id IS
  'BankrollPool shared-object id this row belongs to. Populated for liquidity_provided / liquidity_redeemed / shares_seeded only; NULL on every other event type, which means "not share-affecting" rather than "unknown era". See migration 009 for why the backfill is narrow and why the era boundary is a timestamp.';

-- Backfill. Narrow by event_type so the UPDATE touches only those rows; the partial
-- index from migration 008 on (id) WHERE event_type IN (these three) serves the
-- predicate, so neither statement seq-scans the 1.8 GB table.
--
-- Guarded by `pool_object_id IS NULL` so a re-run is a no-op and cannot
-- reassign a row the indexer has since stamped.

-- Retired pre-v8 pool (0xf74e8c3c..., introduced 2026-04-24, notExists on the
-- live chain as of 2026-10-12).
UPDATE gostop.bankroll_event
   SET pool_object_id = '0xf74e8c3c16ee077651f82459f350e96027c82319686395679d10f08ed0cd306d'
 WHERE event_type IN ('liquidity_provided', 'liquidity_redeemed', 'shares_seeded')
   AND pool_object_id IS NULL
   AND timestamp_ms < 1781869218280;

-- Live v8 pool (0xbed633d5..., wired by the v8 fresh-genesis commit 56f2c92f5).
UPDATE gostop.bankroll_event
   SET pool_object_id = '0xbed633d543e6b3bf932fb91c4238e07e6377ed8e8521e8f67760c2b01c332fd2'
 WHERE event_type IN ('liquidity_provided', 'liquidity_redeemed', 'shares_seeded')
   AND pool_object_id IS NULL
   AND timestamp_ms >= 1781869218280;

-- Serves the scoped per-actor aggregate in risk-metrics topLp5() and
-- me/lp-position. Partial and two-column so the GROUP BY actor reads only the
-- ~2.5k LP rows instead of scanning the table.
-- CONCURRENTLY because the indexer writes to this table continuously; a plain
-- CREATE INDEX takes ACCESS EXCLUSIVE and would stall ingestion. Run this
-- statement on its own, outside any transaction block, or Postgres rejects it.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bre_lp_pool_actor
  ON gostop.bankroll_event (pool_object_id, actor)
  WHERE event_type IN ('liquidity_provided', 'liquidity_redeemed');

-- No GRANT needed: ADD COLUMN inherits the table's existing privileges, unlike
-- migration 008's new table.
