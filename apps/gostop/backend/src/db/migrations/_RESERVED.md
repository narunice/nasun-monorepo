# Migration Number Reservations

Reserve migration numbers ahead of implementation so parallel branches don't collide.
Number selection rule: take the next available integer; do not skip or reuse retired numbers.

## Active reservations

| #   | Owner / Plan                          | Filename (when materialized)        | Status   | Notes |
|-----|---------------------------------------|-------------------------------------|----------|-------|
| 004 | Tier 1 LP Pool (Sub-Plan B / Tier 1.1)| `004_bankroll_event.sql`            | reserved | Unified bankroll event log (bet_collected / winner_paid / bet_refunded / treasury_deposited / liquidity_provided / withdraw_requested / liquidity_redeemed) with running pool_balance + total_shares snapshots. Renamed from `004_lp_history.sql` on 2026-05-18 per Tier 1.0 spike finding §5.2 (single table covers LP history + bankroll PnL SoT). Reserved 2026-05-18. |

## Deferred plans (no number assigned)

- **Streamer Mode full-spec** (overlay / token / WS) — deferred post-mainnet (master plan line 404). If revived, use the next available integer at materialization time. Do not pre-allocate.

## Rules

1. Add the row here in the same PR that introduces the migration filename (or earlier as a reservation-only PR like HG1).
2. When a reservation materializes, flip Status from `reserved` to `applied` and keep the row (history record).
3. Never edit an already-applied migration file. Add a follow-up migration instead.
4. schema-audit test (`apps/gostop/backend/src/db/schema-audit.test.ts`) must pass before merging any new migration.
5. First production deploy of a new migration requires the migration-first-deploy checklist (003 pattern: `lottery_round.draw_tx_digest` was the canonical case).
