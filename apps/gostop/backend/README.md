# @nasun/gostop-backend

Tier 0+ backend for Gostop casino: chain event indexer + REST/WS API powering
leaderboard, live feed, transparency dashboard, session replay, and the user
dashboard (`/me`).

Stateful data lives in the **shared `nasun_points` Postgres** under the
**`gostop` schema**, with isolated roles so this service cannot touch
explorer artifacts (`activity_points` etc.).

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

## Production deploy

### Current runtime (verified 2026-05-18)

**The service is already live on node-3 (54.180.61.196), not the prod EC2
the original PR-C plan targeted.** A manual rsync deploy by the operator
brought it up around 2026-05-17; pm2 has carried both processes for 15+ h
at the time this section was written. Re-deploys must continue to target
node-3 until the operator decides otherwise (see "Drift" below).

| Field | Value |
|---|---|
| Host | node-3 (54.180.61.196), user `ubuntu`, SSH key `~/.ssh/.awskey/nasun-devnet-key.pem` |
| App dir | `/home/ubuntu/gostop-backend/` |
| pm2 processes | `gostop-backend` (api, port **3202**), `gostop-indexer` |
| pm2 mode | api runs `node --import tsx src/api/server.ts` (live src); indexer runs `node dist/indexer/index.js` |
| Public URL | https://api.gostop.app (Let's Encrypt) |
| WS | wss://api.gostop.app/api/gostop/feed/{live,whales} |
| nginx | `/etc/nginx/sites-enabled/api.gostop.app` → 127.0.0.1:3202, `limit_req zone=gostop_api burst=30 nodelay` |
| DB | colocated on the same host — `nasun_points` Postgres, `gostop` schema |
| Deploy method | manual rsync (no git checkout, no `.app-id` marker, no `migrations/` dir on box) |
| ecosystem.config.cjs | divergent from monorepo (api uses tsx-src, api `max_memory_restart=1024M`) |

### Drift between monorepo and the live runtime

These DO NOT match what's running on node-3 today — reconcile before
running any automated deploy:

- `apps/gostop/backend/ecosystem.config.cjs` declares `script: 'dist/api/server.js'`,
  but prod runs api from `src/` via tsx. Following the monorepo version
  would change pm2 behavior (and break if `dist/api/server.js` is stale
  relative to `src/`).
- `apps/gostop/backend/ecosystem.config.cjs` sets api
  `max_memory_restart: '512M'`; prod uses 1024M.
- `scripts/deploy-gostop-backend-production.sh` (PR-C) targets
  **prod EC2 43.200.67.52** with `ec2-user` + `nasun-prod-key`. Pointing
  it at node-3 requires changing the host, user, SSH key, and adjusting
  the ecosystem template before any first run.

The script + monorepo ecosystem are preserved as-is so a future cleanup PR
can reconcile them in one commit; do not run `pnpm deploy:gostop-backend:prod`
against current prod until that's done.

### Re-deploying the current runtime (manual until reconciliation lands)

```bash
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196
# on node-3:
cd ~/gostop-backend
# rsync new src/ + dist/ + package.json + pnpm-lock.yaml from monorepo
# then:
pnpm install --frozen-lockfile
pnpm build                                # produces dist/ used by indexer
pm2 restart gostop-backend gostop-indexer # api re-imports src via tsx on restart
pm2 logs gostop-backend --lines 50 --nostream
pm2 logs gostop-indexer --lines 50 --nostream
```

The api process re-imports `src/` on every restart (tsx live), so an in-place
src edit on the box plus `pm2 restart gostop-backend` is enough for an api
hotfix. Indexer requires a `pnpm build` because it loads compiled JS.

### First-deploy checklist (for a fresh environment, NOT current prod)

If you ever bring up a new gostop-backend host (migration off node-3,
staging clone, disaster recovery), do this once before the deploy script:

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

Current prod has 001 + 002 + the 003 column (003 was applied manually by
the operator before the migration file existed in the repo). `gostop`
schema is fully bootstrapped on node-3; no schema work needed for the
in-place re-deploy path.

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
