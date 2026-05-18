# @nasun/gostop-backend

Tier 0+ backend for Gostop casino: chain event indexer + REST/WS API powering
leaderboard, live feed, transparency dashboard, session replay, and the user
dashboard (`/me`).

Two pm2 processes, both deployed on **prod EC2 __PROD_EC2_HOST__** (shared with
nasun-website / pado / explorer-api). Stateful data lives in the **shared
`nasun_points` Postgres** under the **`gostop` schema**, with isolated roles so
this service cannot touch explorer artifacts (`activity_points` etc.).

| Process | Source | Role | Purpose |
|---|---|---|---|
| `gostop-indexer` | `src/indexer/` | `gostop_writer` (LIMIT 20) | Sui event stream → `gostop.game_round` + game-specific tables |
| `gostop-api` | `src/api/` | `gostop_reader` (LIMIT 30) | Hono REST + WS. Cross-schema SELECT on `public.activity_points` for ecosystem-points integration on User Dashboard. |

See:
- [<CLAUDE_DIR>/plans/2026-05-17-gostop-tier0-implementation.md](../../../../.claude/plans/2026-05-17-gostop-tier0-implementation.md) — full implementation plan
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

Canonical path: `pnpm deploy:gostop-backend:prod` (calls
`scripts/deploy-gostop-backend-production.sh`). The script handles:

- typecheck + `tsc -p tsconfig.build.json` (test files excluded from dist)
- `.app-id` marker check — refuses to overwrite `${REMOTE_BASE}` if it's
  hosting a different app, preventing the cross-app overwrite class of
  incident (2026-05-03 pado → nasun-website precedent)
- backup of the current remote `dist` to `dist.bak.<TS>` (also the source
  for `--rollback`)
- rsync of `dist/`, `.app-id`, `ecosystem.config.cjs`, `package.json`, and
  `src/db/migrations/` (migrations land in `~/gostop-backend/migrations/`
  for manual application, never auto-applied)
- pm2 `startOrRestart` with `set -a; source .env; set +a` so the pm2
  daemon re-parses ecosystem.config.cjs against the freshly sourced .env
  (see `feedback_pm2_daemon_env_resolution.md` — `--update-env` alone
  does not re-evaluate ecosystem CJS)
- loopback health check against `gostop-api`

`pnpm deploy:gostop-backend:prod -- --rollback` restores the most recent
`dist.bak.<TS>` and hard-restarts pm2 against it.

### First-deploy checklist (run on prod EC2 once, before the script)

The script assumes `~/gostop-backend/.env` already exists with the
production values. The most consequential entry is `FEED_ANON_SALT`:

```bash
# Generate a fresh 64-char hex salt. NEVER rotate this value once any
# anon_id has been published — every anonymous wallet's pseudonym is
# derived from it and rotation breaks identity continuity on the feed
# and leaderboard.
openssl rand -hex 32
```

`src/env.ts` refuses to boot in production when `FEED_ANON_SALT` is
unset, equals the dev fallback literal, or is shorter than 32 chars
(see `resolveAnonSalt()` and the two production signals
`NODE_ENV=production` / `GOSTOP_REQUIRE_PROD_SALT=1`).

Other required env vars per `.env.example`: `GOSTOP_DATABASE_URL` (writer
DSN, must reach the `nasun_points` Postgres on node-3), `GOSTOP_READ_URL`
(reader DSN, may fall back to writer), `SUI_RPC_URL`, `AUTH_JWT_SECRET`,
`FEED_PG_CHANNEL`.

DB bootstrap (once, as `postgres` superuser on node-3):

```bash
psql -d nasun_points -f migrations/001_initial.sql
psql -d nasun_points -c "ALTER ROLE gostop_writer PASSWORD '<from .env>';"
psql -d nasun_points -c "ALTER ROLE gostop_reader PASSWORD '<from .env>';"
# Tier 0 PR-4 leaderboard window-scan index (apply in autocommit / outside a tx
# because CREATE INDEX CONCURRENTLY cannot run inside BEGIN/COMMIT):
psql -d nasun_points -f migrations/002_idx_gr_final_ts_player.sql
# Tier 0 e2e gap fix: lottery_round.draw_tx_digest column referenced by
# indexer + /lottery/draws + transparency / replay frontend (without this the
# first NumbersDrawn event crashes the indexer):
psql -d nasun_points -f migrations/003_lottery_round_draw_tx_digest.sql
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
