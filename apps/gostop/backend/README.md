# @nasun/gostop-backend

Tier 0+ backend for Gostop casino: chain event indexer + REST/WS API powering
leaderboard, live feed, transparency dashboard, session replay, and the user
dashboard (`/me`).

Two pm2 processes, both deployed on **prod EC2 43.200.67.52** (shared with
nasun-website / pado / explorer-api). Stateful data lives in the **shared
`nasun_points` Postgres** under the **`gostop` schema**, with isolated roles so
this service cannot touch explorer artifacts (`activity_points` etc.).

| Process | Source | Role | Purpose |
|---|---|---|---|
| `gostop-indexer` | `src/indexer/` | `gostop_writer` (LIMIT 20) | Sui event stream → `gostop.game_round` + game-specific tables |
| `gostop-api` | `src/api/` | `gostop_reader` (LIMIT 30) | Hono REST + WS. Cross-schema SELECT on `public.activity_points` for ecosystem-points integration on User Dashboard. |

See:
- [/home/naru/.claude/plans/2026-05-17-gostop-tier0-implementation.md](../../../../.claude/plans/2026-05-17-gostop-tier0-implementation.md) — full implementation plan
- [../docs/game-result-schema.md](../docs/game-result-schema.md) — event → canonical row mapping (Tier 0.0 spike output)
- `src/db/migrations/001_initial.sql` — schema + role bootstrap

## Local development

```bash
# from monorepo root
pnpm install
cp apps/gostop/backend/.env.example apps/gostop/backend/.env
# edit .env with local DB / RPC values

# in two terminals
pnpm --filter @nasun/gostop-backend dev:indexer
pnpm --filter @nasun/gostop-backend dev:api
```

## Production deploy (prod EC2)

```bash
# on prod EC2, repo root
pnpm install
pnpm --filter @nasun/gostop-backend build

cd apps/gostop/backend
set -a && source .env && set +a
pm2 startOrRestart ecosystem.config.cjs
pm2 save
```

DB bootstrap (once, as `postgres` superuser):

```bash
psql -d nasun_points -f src/db/migrations/001_initial.sql
# then set role passwords:
psql -d nasun_points -c "ALTER ROLE gostop_writer PASSWORD '<from .env>';"
psql -d nasun_points -c "ALTER ROLE gostop_reader PASSWORD '<from .env>';"
```

## Operational guardrails

- **Off-peak heavy work**: `REFRESH MATERIALIZED VIEW CONCURRENTLY` and any
  backfill run only between UTC 03:00–04:00 to avoid colliding with the
  ecosystem points pipeline (00:00 leaderboard reset / 00:05 daily-snapshot /
  00:15 settle-pado / 00:20 settle-ecosystem / `30 */6` fullnode-restart).
- **Connection pool**: `GOSTOP_DB_POOL_MAX=10` per process (combined 20 ≤
  writer LIMIT 20).
- **RPC retry**: reuse the centralized retry+backoff pattern from
  `apps/network-explorer/api-server/src/rpc.ts` (3 attempts, exponential
  backoff with `Retry-After` honored) — see 2026-05-12 RPC 503 mitigation in
  `docs/ecosystem-points-system.md`.
- **Auth**: JWT TTL 1h + IP binding (Tier 0.3 review boost). Rotate
  `AUTH_JWT_SECRET` periodically.
