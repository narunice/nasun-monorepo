# Migration Number Reservations

Reserve migration numbers ahead of implementation so parallel branches don't collide.
Number selection rule: take the next available integer; do not skip or reuse retired numbers.

## Active reservations

| #   | Owner / Plan                          | Filename (when materialized)        | Status   | Notes |
|-----|---------------------------------------|-------------------------------------|----------|-------|
| 004 | Tier 1 LP Pool (Sub-Plan B / Tier 1.1)| `004_bankroll_event.sql`            | materialized | Bankroll event log: bet_refunded / treasury_deposited / liquidity_provided / withdraw_requested / liquidity_redeemed / shares_seeded / cap_updated with running total_shares_after snapshot. Bet/payout sides derived from gostop.game_round JOIN (lp-gap-analysis.md §5.1, plan v3 §3.A — 1:1 byte-equivalence in 5 non-lottery games). pool.balance read from chain at query time (plan v3 §3.F). Embeds BetRefunded cursor reset for historical replay. Status flips to `applied` on prod merge. Materialized 2026-05-18. |

## Deferred plans (no number assigned)

- **Streamer Mode full-spec** (overlay / token / WS) — deferred post-mainnet (master plan line 404). If revived, use the next available integer at materialization time. Do not pre-allocate.

## Rules

1. Add the row here in the same PR that introduces the migration filename (or earlier as a reservation-only PR like HG1).
2. When a reservation materializes, flip Status from `reserved` to `applied` and keep the row (history record).
3. Never edit an already-applied migration file. Add a follow-up migration instead.
4. schema-audit test (`apps/gostop/backend/src/db/schema-audit.test.ts`) must pass before merging any new migration.
5. First production deploy of a new migration requires the migration-first-deploy checklist (003 pattern: `lottery_round.draw_tx_digest` was the canonical case).
