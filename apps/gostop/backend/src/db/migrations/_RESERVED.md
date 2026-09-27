# Migration Number Reservations

Reserve migration numbers ahead of implementation so parallel branches don't collide.
Number selection rule: take the next available integer; do not skip or reuse retired numbers.

## Active reservations

| #   | Owner / Plan                          | Filename (when materialized)        | Status   | Notes |
|-----|---------------------------------------|-------------------------------------|----------|-------|
| 004 | Tier 1 LP Pool (Sub-Plan B / Tier 1.1)| `004_bankroll_event.sql`            | applied  | Bankroll event log: bet_refunded / treasury_deposited / liquidity_provided / withdraw_requested / liquidity_redeemed / shares_seeded / cap_updated with running total_shares_after snapshot. Bet/payout sides derived from gostop.game_round JOIN (lp-gap-analysis.md §5.1, plan v3 §3.A — 1:1 byte-equivalence in 5 non-lottery games). pool.balance read from chain at query time (plan v3 §3.F). Embeds BetRefunded cursor reset for historical replay. **Applied 2026-05-19 on node-3 prod**: `sudo -u postgres psql -d nasun_points` (CREATE TABLE needed superuser; gostop_writer auto-granted default privileges). Indexer total_shares_after = 2_809_416_960_142 matches chain exactly; 1 historical BetRefunded event lost during the cursor-reset gap (sub-second window before new code deployed) — acceptable per pre-deploy decision. |

| 008 | Bankroll share divergence rework      | `008_bankroll_shares_checkpoint.sql`| pending  | Adds `gostop.bankroll_shares_checkpoint` (one row per BankrollPool object) plus a partial index on the three share-affecting event types. Replaces the running `bankroll_event.total_shares_after` as the basis for chain-vs-DB divergence detection. The running total could not work: it needs a total order but six streams insert out of order behind a watermark that is the MIN across them, so the scan's `id > fromId` guard stepped over held-back rows permanently (13 rows stuck 2026-06-07..06-20), and a sum from genesis cannot survive a chain reset (the v8 fresh genesis on 2026-06-19 had its 100e9 seed added to the retired chain's ~11.3e12 because `shares_seeded` is additive, which is the entire 2.67x gap: DB 17,895,434,554,337 vs chain 6,700,394,818,316 on 2026-09-27). A sum of deltas is order independent, so divergence is now incremental from a chain-anchored checkpoint. `total_shares_after` retired in place; a follow-up migration drops it after a soak. **First-deploy checklist: apply this migration BEFORE deploying the backend** — `indexer/index.ts` probes the table at boot and the indexer will refuse to start without it. CREATE TABLE in the gostop schema needs superuser (same as 004): `sudo -u postgres psql -d nasun_points`. |

## Deferred plans (no number assigned)

- **Streamer Mode full-spec** (overlay / token / WS) — deferred post-mainnet (master plan line 404). If revived, use the next available integer at materialization time. Do not pre-allocate.

## Rules

1. Add the row here in the same PR that introduces the migration filename (or earlier as a reservation-only PR like HG1).
2. When a reservation materializes, flip Status from `reserved` to `applied` and keep the row (history record).
3. Never edit an already-applied migration file. Add a follow-up migration instead.
4. schema-audit test (`apps/gostop/backend/src/db/schema-audit.test.ts`) must pass before merging any new migration.
5. First production deploy of a new migration requires the migration-first-deploy checklist (003 pattern: `lottery_round.draw_tx_digest` was the canonical case).
