# NSI Phase 1 Runbook

> **Status**: Code-side complete (2026-05-22). Deployment-side pending — see "Deployment Sequence" below.
> **Plans**:
> - Big Picture — [/home/naru/.claude/plans/tier-weighted-emissions-points-frolicking-mango.md](/home/naru/.claude/plans/tier-weighted-emissions-points-frolicking-mango.md)
> - Phase 1 v3 — [/home/naru/.claude/plans/2026-05-22-tier-phase1-foundation-v3-nsi.md](/home/naru/.claude/plans/2026-05-22-tier-phase1-foundation-v3-nsi.md)

## TL;DR

Nasun Standing Index (NSI) is the protocol-internal measure used to derive tier 1/2/3. Phase 1 launches an isolated `tier-worker` pm2 process on node-3 that runs three hourly cron jobs (`staking-principal-sync`, `lp-position-sync`, `nsi-compute`) and exposes results via `/api/v1/standing/*`. The main `explorer-api` scanner, `daily-nft-check.ts`, `@nasun/wallet-ui`, and all on-chain state are deliberately untouched.

## Quick Reference

| Component | Location |
|---|---|
| Worker process | node-3 pm2 app `tier-worker` |
| Worker entry | `apps/network-explorer/api-server/src/workers/tier-worker.ts` → `dist/workers/tier-worker.js` |
| Cron jobs | `scanner/{staking-principal-sync,lp-position-sync,nsi-compute}.ts` |
| API route | `/api/v1/standing/by-address/:address`, `/_/health`, `/_/distribution` |
| Move packages | `packages/nasun-tier/`, `packages/nasun-treasury/` (source + tests only — publish deferred to Phase 4) |
| DB schema | `apps/network-explorer/api-server/src/db/nsi-schema.sql` |
| Frontend badge | `apps/nasun-website/frontend/src/components/navbar/NavStandingBadge.tsx` |
| Tier-worker .env keys | `ENABLE_STAKING_PRINCIPAL_SYNC`, `ENABLE_LP_POSITION_SYNC`, `ENABLE_NSI_COMPUTE`, `NSI_MONOTONE_UP_UNTIL` |

## SSH Access (same as launch-runbook.md)

```bash
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196
```

---

## Deployment Sequence (24h gate, 5 days)

> Each step requires the previous one to be healthy for ≥24h before flipping the next env flag.
> `pm2 reload ecosystem.config.cjs` is forbidden — it restarts `explorer-api` too. Always use `--only tier-worker`.

### Pre-flight (one-time, before Day 1)

```bash
# 1. Pull latest code on node-3
cd ~/explorer-api
git fetch origin
git log HEAD..origin/main --oneline  # expect dbc5f00d + 833cc4f6 + 2b5ab76a
git pull origin main
pnpm install
cd apps/network-explorer/api-server
pnpm build
ls -la dist/workers/tier-worker.js dist/scanner/{staking-principal,lp-position,nsi}-*.js \
       dist/routes/standing.js  # all should exist

# 2. Apply DB migration (idempotent IF NOT EXISTS)
source ~/explorer-api/.env  # load POINTS_DATABASE_URL
psql "$POINTS_DATABASE_URL" -f src/db/nsi-schema.sql
psql "$POINTS_DATABASE_URL" -c "\dt user_nsi user_staking_daily_snapshots user_lp_daily_snapshots"
# Expect 3 tables.

# 3. EXPLAIN ANALYZE the two heaviest queries before launch
psql "$DATABASE_URL" -c "EXPLAIN ANALYZE SELECT encode(sender, 'hex'), COUNT(DISTINCT tx_sequence_number) FROM tx_affected_addresses WHERE sender IS NOT NULL GROUP BY sender LIMIT 5;"
psql "$POINTS_DATABASE_URL" -c "EXPLAIN ANALYZE SELECT actor, SUM(CASE WHEN event_type = 'liquidity_provided' THEN amount WHEN event_type = 'liquidity_redeemed' THEN -amount END) FROM gostop.bankroll_event WHERE event_type IN ('liquidity_provided','liquidity_redeemed') GROUP BY actor LIMIT 5;"
# If either is > 5s, lower cron interval before enabling.

# 4. Confirm Postgres timezone is UTC
psql "$POINTS_DATABASE_URL" -c "SHOW timezone;"
# Expect 'UTC' or 'Etc/UTC'. Otherwise add `SET timezone='UTC'` to scripts.
```

### Pre-flight checklist for any new cron / scanner / worker

Day 1 deploy에서 3 production-only 이슈를 발견한 후 (commits `d0a020fa`, `a79b5faf`, `782f80b4`) 추가된 체크리스트. 새 `.ts` cron/scanner 작성 시 PR merge 전 모두 확인.

- [ ] **ESM `.js` extension** — sibling/relative import 라인 `from '../foo';` → `from '../foo.js';`. tsc bundler 모드는 typecheck pass시키지만 Node runtime 거부 ([feedback_esm_js_extension_required](.claude memory))
- [ ] **postgres.js bulk insert chunking** — `INSERT ... ${db(rows, cols...)}` 는 row 수 × col 수가 65535 미만이어야 함. 안전한 batch size: `Math.floor(65535 / cols / 2)`. 5K rows 시점에 동작해도 50K 시점에 abort 가능 ([feedback_postgres_js_param_cap](.claude memory))
- [ ] **activity_points query plan** — 신규 query는 `idx_ap_identity_timestamp (identity_id, tx_timestamp)`, `idx_ap_timestamp (tx_timestamp)`, `idx_ap_wallet (wallet_address)` 셋 중 하나 활용. `processed_at` ORDER/WHERE, `LOWER(wallet_address)`, `DISTINCT (identity_id, wallet_address)` 모두 sequential scan ([feedback_activity_points_index_usage](.claude memory))
- [ ] **신규 cron은 env flag로 gate** — `if (process.env.ENABLE_X !== 'true') return;` 패턴. .env에서 즉시 disable 가능
- [ ] **Telegram alert에 dedupKey 명시** — `sendTelegramAlert(msg, { dedupKey: 'foo-fail' })`. 누락 시 6h마다 spam 반복
- [ ] **pm2 start 후 1분 logs 모니터링 필수** — typecheck/lint 모두 통과해도 ESM runtime 또는 DB query plan 차원의 silent breakage 가능
- [ ] **첫 cycle row count 확인** — 예상 N rows ± 30% 범위. partial-failure ratio < 5%
- [ ] **prod EC2와 격리된 pm2 fork mode 권장** — `pm2 start --only <new-worker>`. `pm2 reload ecosystem.config.cjs` 금지 (다른 process도 재시작됨)

### Day 1 — staking-principal-sync only

```bash
cd ~/explorer-api/apps/network-explorer/api-server

# Back up env (PreToolUse hook also auto-backs up)
cp .env .env.bak.$(date +%s)

# Append NSI flags (Day 1: staking only; LP + compute stay false)
cat >> .env <<'EOF'

# === NSI tier-worker (Phase 1 v3, Day 1) ===
ENABLE_STAKING_PRINCIPAL_SYNC=true
ENABLE_LP_POSITION_SYNC=false
ENABLE_NSI_COMPUTE=false

# 7-day monotone-up window suppresses tier downgrades during launch.
# Telegram fires a one-shot alert when this expires.
NSI_MONOTONE_UP_UNTIL=2026-05-29T00:00:00Z
EOF

# Start the new pm2 app — DO NOT use `pm2 reload`
pm2 start ecosystem.config.cjs --only tier-worker
pm2 save
pm2 logs tier-worker --lines 30
```

**1h verification:**
```bash
psql "$POINTS_DATABASE_URL" -c "
  SELECT COUNT(*) AS snapshots, MAX(captured_at) AS latest
  FROM user_staking_daily_snapshots
  WHERE day = CURRENT_DATE;
"
# Expect ~5k rows (active stakers).
pm2 list  # tier-worker = online, < 100MB
```

**24h observation checklist:**
- [ ] `pm2 status` shows `tier-worker` online with no restarts
- [ ] `staking-principal-sync` log entry every hour
- [ ] No Telegram alerts with dedupKey `staking-principal-sync-fail`
- [ ] Fullnode CPU at baseline (no 5/12-class RPC 503 burst)
- [ ] `explorer-api` cycle timing unchanged (`pm2 logs explorer-api | grep cycle`)

### Day 2 — lp-position-sync

```bash
sed -i 's/^ENABLE_LP_POSITION_SYNC=false$/ENABLE_LP_POSITION_SYNC=true/' .env
pm2 restart tier-worker
pm2 logs tier-worker --lines 30
```

**1h verification:**
```bash
psql "$POINTS_DATABASE_URL" -c "
  SELECT COUNT(*) AS positions, AVG(lp_usd)::numeric(12,2) AS avg_lp
  FROM user_lp_daily_snapshots
  WHERE day = CURRENT_DATE AND venue = 'gostop-bankroll';
"
# Expect tens of LP holders (current gostop bankroll cohort).
```

**24h checklist:** same as Day 1 + no `lp-position-sync-fail` alerts.

### Day 3 — nsi-compute + API route

```bash
sed -i 's/^ENABLE_NSI_COMPUTE=false$/ENABLE_NSI_COMPUTE=true/' .env
pm2 restart tier-worker

# explorer-api also needs a restart to pick up the new /api/v1/standing route
# (the route module is imported by index.ts at startup).
pm2 restart explorer-api
pm2 logs explorer-api --lines 20  # confirm route mounted
```

**1h verification:**
```bash
# DB distribution
psql "$POINTS_DATABASE_URL" -c "
  SELECT tier, COUNT(*) AS users, AVG(nsi_score)::numeric(7,2) AS avg_nsi
  FROM user_nsi GROUP BY tier ORDER BY tier;
"
# Expect roughly t1 ≈ 30k, t2 ≈ 5k, t3 ≈ 500 (rough estimate, real distribution
# may differ — tune TIER_2_THRESHOLD / TIER_3_THRESHOLD / sub-score WEIGHTS
# in nsi-compute.ts if the spread is too narrow/wide).

# API
curl -s https://api.nasun.io/api/v1/standing/_/health | jq
curl -s https://api.nasun.io/api/v1/standing/_/distribution | jq
curl -s https://api.nasun.io/api/v1/standing/by-address/0x<TEST_WALLET> | jq
```

**Threshold tuning** (if distribution is off):
- Edit `apps/network-explorer/api-server/src/scanner/nsi-compute.ts` constants
- Rebuild + `pm2 restart tier-worker` (next cron cycle picks up new thresholds)
- No DB migration needed — tier values recompute idempotently

### Day 4 — Frontend verification

The `NavStandingBadge` shipped earlier in commit `8539316e`. If the frontend was deployed before tier-worker existed, the badge silently fails (no /standing/* response). After Day 3, badges should appear for logged-in users.

```bash
# From a logged-in browser session:
# 1. Open nasun.io
# 2. Confirm a "Tier X" pill appears next to the wallet button
# 3. Hover -> tooltip shows "Nasun Standing: NNN / 1000 (next tier at MMM)"
# 4. For three distinct wallets at different tiers, confirm colour:
#    Tier 1 = light navy (nasun.nw4), Tier 2 = violet (pado.violet), Tier 3 = gold (nasun.c1)
```

If badge is missing despite Day 3 API health green:
1. Check browser console for fetch errors
2. Confirm `VITE_EXPLORER_API_URL` is embedded in prod `dist/assets/*.js` via `/env-verify nasun-website`
3. CloudFront cache: `pnpm invalidate:nasun-website:cdn`

### Day 5 — Stability + launch declaration

After 24h with all three crons running and frontend badges visible:
- `pm2 logs tier-worker --lines 200` review for warnings
- Confirm Telegram has not received any NSI-related alerts
- Mark Phase 1 v3 §DoD checkboxes ✓
- Schedule a follow-up review on **2026-05-29 (monotone-up expiry)** — automatic Telegram alert will fire when the window flips off; expect a wave of tier downgrades and check for user complaints

---

## Monitoring

### Health endpoints
```bash
# NSI compute health (row count + last computed_at)
curl -s https://api.nasun.io/api/v1/standing/_/health | jq

# Tier distribution (public)
curl -s https://api.nasun.io/api/v1/standing/_/distribution | jq
```

### pm2
```bash
pm2 list                       # tier-worker should be 'online'
pm2 logs tier-worker --lines 50
pm2 describe tier-worker       # memory, restart count, uptime
```

### DB queries

```sql
-- Latest snapshot freshness per cron
SELECT 'staking' AS cron, MAX(captured_at) FROM user_staking_daily_snapshots
UNION ALL SELECT 'lp', MAX(captured_at) FROM user_lp_daily_snapshots
UNION ALL SELECT 'nsi', MAX(computed_at) FROM user_nsi;

-- Sub-score breakdown for a wallet
SELECT identity_id, tier, nsi_score, sub_scores, has_gp
FROM user_nsi
WHERE LOWER(wallet_address) = '0x...';

-- Tier change activity (last hour)
SELECT tier, previous_tier, COUNT(*)
FROM user_nsi
WHERE computed_at > now() - INTERVAL '1 hour' AND previous_tier IS NOT NULL AND tier != previous_tier
GROUP BY tier, previous_tier
ORDER BY 1, 2;
```

### Telegram alerts (dedup keys)

| dedupKey | When |
|---|---|
| `staking-principal-sync-fail` | 6+ consecutive failures of staking sync |
| `lp-position-sync-fail` | 6+ consecutive failures of LP sync |
| `nsi-compute-fail` | 6+ consecutive failures of NSI compute |
| `nsi-compute-bootstrap` | NSI compute skipped because staking snapshots are empty (first-run) |
| `nsi-compute-stale-staking` | NSI compute skipped because staking snapshots are > 2 days old |
| `nsi-monotone-expired` | One-shot when `NSI_MONOTONE_UP_UNTIL` has passed |

---

## Rollback

Three independent rollback levers, each safe and reversible.

### Lever 1 (preferred): disable a single cron via env

Lowest blast radius. Other crons continue running; explorer-api is untouched.

```bash
cd ~/explorer-api/apps/network-explorer/api-server
# Flip whichever is misbehaving
sed -i 's/^ENABLE_NSI_COMPUTE=true$/ENABLE_NSI_COMPUTE=false/' .env
# (or ENABLE_LP_POSITION_SYNC / ENABLE_STAKING_PRINCIPAL_SYNC)
pm2 restart tier-worker
```

### Lever 2: stop the worker process entirely

```bash
pm2 stop tier-worker   # keeps the entry; resume with `pm2 start tier-worker`
# or
pm2 delete tier-worker # removes from pm2 — re-add via ecosystem.config.cjs
```

`explorer-api` is unaffected — the `tier-worker` is a separate pm2 app in fork mode.

### Lever 3: truncate NSI tables

Only if the tables themselves are corrupted (wrong tiers persisted, schema mismatch). `points-integrity-guard` does not apply to these tables, so TRUNCATE succeeds without bypass.

```bash
psql "$POINTS_DATABASE_URL" <<'SQL'
TRUNCATE user_nsi, user_staking_daily_snapshots, user_lp_daily_snapshots;
SQL
```

After truncate the API `/by-address/:address` falls back to `tier=1` for everyone until the next cron cycle repopulates.

### Lever 4: frontend revert

The `NavStandingBadge` already lives in prod (commit `8539316e`). If something is wrong with the badge itself:

```bash
# From local repo
git revert <bad-commit>
pnpm deploy:nasun-website:prod -- --force
pnpm invalidate:nasun-website:cdn
```

If the API is down but the badge code is fine, the badge silently fails (returns null) — no user-visible error.

---

## Tuning Levers (no migration needed)

All constants are in `apps/network-explorer/api-server/src/scanner/nsi-compute.ts` top-of-file. Edit + rebuild + `pm2 restart tier-worker` — the next cron cycle uses the new values.

| Lever | Const | Default | Effect |
|---|---|---|---|
| Tier 3 cutoff | `TIER_3_THRESHOLD` | 600 | Higher = fewer T3 users |
| Tier 2 cutoff | `TIER_2_THRESHOLD` | 250 | Higher = fewer T2/T3 users |
| Sub-score weights | `W_STAKING, W_LP, W_TX, W_DIVERSITY, W_NFT` | 0.35/0.20/0.20/0.15/0.10 | Rebalance which behaviors matter most |
| Staking sensitivity | `STAKING_DIVISOR=10, STAKING_SCALE=250` | 10 NSN → 0, 1k → 500, 100k → 1000 | Reward sensitivity to stake size |
| LP sensitivity | `LP_DIVISOR=1, LP_SCALE=250` | $1 → 0, $100 → 500, $10k → 1000 | Reward sensitivity to LP USD |
| Tx activity sensitivity | `TX_SCALE=250` | Lifetime tx (Phase 1.5 → 30d window) | Reward per-tx volume |
| Diversity max | `DIVERSITY_CATEGORIES_MAX=7` | 7 categories = 1000 | How many distinct dApps need touching |
| NFT weights | `NFT_ALLIANCE_WEIGHT=1, NFT_GP_WEIGHT=2` | GP counts 2x Alliance | NFT-holder reward |

For per-cycle cadence, `COMPUTE_INTERVAL_MS = 60 * 60 * 1000`. Bump to `6 * 60 * 60 * 1000` (6h) if the indexer load is too high.

---

## Known Phase 1 Limitations / Phase 1.5 Backlog

| Limitation | Why | Plan |
|---|---|---|
| Tx activity is lifetime, not 30d | `tx_affected_addresses` has no time column; 30d window needs JOIN against `checkpoints` | Phase 1.5: add `checkpoints` join, drop `TX_SCALE` from 250 → 350 |
| LP USD ≈ NUSDC amount, not shares × NAV | Phase 1 assumption holds at launch; diverges as bankroll NAV moves | Phase 2: switch to shares × current NAV via `gostop.bankroll_share_price` |
| No Pado spot LP | DeepBook V3 maker order tracking not yet indexed | Phase 2: add `pado-spot` venue to `user_lp_daily_snapshots` |
| No average wallet balance | Requires new daily balance snapshot indexer | Phase 1.5 |
| No prediction win-rate sub-score | Noisy at low volume | Phase 2 |
| `nsi_score` is publicly readable via API | Phase 1 intentional transparency | Phase 2: gate behind zkLogin for owner-only sub-score detail |
| TierRegistry not yet on-chain | Move publish deferred | Phase 4 (Staking wrapper introduces first on-chain consumer) |

---

## Phase 2 Entry Conditions

Begin Phase 2 (Agent Leaderboard + AI inference subsidy + cross-chain history API) after:

- [ ] Phase 1 v3 §DoD all 12 code-side + 5 deployment-side items checked
- [ ] 1 week of stable operation (no Telegram alerts beyond the monotone-up expiry one-shot)
- [ ] Monotone-up window expired and sliding behavior confirmed (after 2026-05-29)
- [ ] Real tier distribution measured and thresholds tuned if needed
- [ ] No user complaints about tier downgrades after monotone-up expiry
- [ ] LP v113 → v114 wording update queued (Standing replaces "capital authority")
