# nasun-chat-server

> **Note**: Despite the name, this server hosts pado-specific trading backend
> (leaderboard, indexer, aggregator, market-narrator, trade API) alongside chat.
> Pado-specific logic is scheduled to migrate to `apps/pado/data-server/` when
> trigger conditions met. Route convention: pado-specific = `/api/pado/*`,
> future apps = `/api/{app}/*`. Legacy unprefixed routes pending follow-up migration.
> Rename/URL transitions use additive-first (keep → add → cutover → remove).
> See `.claude/handoffs/2026-04-12-chat-server-role-clarification.md`

## Baseline (2026-04-12)

Measured on production at PR#1 A-0 (prod EC2: ec2-user@__PROD_EC2_HOST__).

| Metric | Value |
|--------|-------|
| trader_points rows | 500 |
| leaderboard.db size | 2.5 GB |
| PM2 restarts (cumulative) | 17 |
| Write QPS | TBD (CloudWatch custom metric) |
| aggregator CPU peak | TBD (CloudWatch custom metric) |

**Re-evaluation triggers** (act if any):
- New app needs own leaderboard / indexer → evaluate options C/D
- Write QPS > 100
- leaderboard.db > 10 GB
- aggregator CPU spike impacts WS chat latency
- pado-only endpoint count grows by +5 → stand up `apps/pado/data-server/`

Observability CloudWatch dashboard: **TBD** (see Follow-up in
`.claude/plans/enumerated-conjuring-quokka.md`). This table will be replaced
by a link to the dashboard once the metrics pipeline is live.

## Notable tables (historical names)

`trader_points`, `points_snapshots` — historical table names; values are DEX
trading **scores**. DB rename (`pado_trader_scores`, `pado_score_snapshots`)
is a follow-up; SQLite `ALTER TABLE` is O(1) and scheduled for the next major
release alongside the SQL comment cleanup.
