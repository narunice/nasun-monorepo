# Nasun Ecosystem Leaderboard - Implementation Reference

Last updated: 2026-04-27 (W17 first settlement complete; social account requirement removed; staking-daily vs staking-reward distinction clarified; week boundary changed Mon 00:10 UTC → 00:00 UTC; settle-ecosystem automated via cron Mon 00:20 UTC)

## Overview

Nasun Ecosystem Leaderboard ranks users by **weekly on-chain activity diversity**,
**game/transfer volume**, and **creator post contributions**. NFT multipliers do not
affect leaderboard ranking (they only apply when distributing Ecosystem Points at week
end). Any user with qualifying activity in the current week appears automatically.

This is distinct from two other leaderboard systems in the same product:

| System                   | Data source                  | Reset                  | Scope                                       |
| ------------------------ | ---------------------------- | ---------------------- | ------------------------------------------- |
| Ecosystem Leaderboard    | PostgreSQL `activity_points` | Weekly (Mon 00:00 UTC) | On-chain diversity + game volume + creator posts |
| Pado Leaderboard         | SQLite (chat-server)         | Weekly (Mon 00:00 UTC) | DEX trading volume/PnL                      |
| Community Leaderboard V3 | DynamoDB                     | Seasonal               | X/Twitter social posts                      |

---

## Score Formula

```
weekly_score = activity_score
             + creator_post_score   (= SUM(final_points) / 5.0)
             + bonus_score          (= bugreport+feedback / 2.0 + game / 3.0)
             + volume_bonus         (= 1.6 * LOG2(volume_count + 1))
             + staking_emission     (= SUM(final_points) WHERE category='staking-reward')

activity_score =
  COUNT of DISTINCT (identity_id, day_slot, category) triples over the week
  where day_slot = FLOOR((epoch(tx_timestamp) - epoch(week_start)) / 86400)

volume_count =
  COUNT(*) WHERE category IN ('pado-lottery','pado-games','pado-scratchcard','wallet-transfer')
  (NOT deduplicated - each transaction counts)

staking_emission per day =
  STAKING_EMISSION_COEFF * LOG2(daily_estimated_reward_delta_mist + 1)
  STAKING_EMISSION_COEFF = 0.07  (set 2026-04-22; was 0.05 at launch)
```

### Included activity categories (for activity_score)

All `activity_points` rows that are:

- `NOT flagged`
- `identity_id IS NOT NULL`
- Within week bounds (`tx_timestamp >= week_start AND < week_end`)
- Category NOT IN: `referral-bonus`, `daily-mission`, `ecosystem-passive`, `staking-daily`, `staking`, `staking-reward`
- Category NOT LIKE: `ecosystem-bonus-%` (creator-posts/bugreport/feedback/game handled separately)
- Category NOT LIKE: `pado-%` (pado-dex covered by Pado Leaderboard; games included via volume_bonus)

Notable inclusions: `governance`, `wallet-transfer`, `faucet`, `baram-*`, `chat`.

### Volume bonus

Game plays and wallet transfers are rewarded by raw transaction count with logarithmic
diminishing returns. `wallet-transfer` is intentionally counted in both `activity_score`
(1 pt/day deduplicated) and `volume_bonus` (per-transaction).

`pado-dex` is excluded (covered by Pado Score Leaderboard). `pado-lottery`, `pado-games`,
and `pado-scratchcard` are NOT in the Pado Score Leaderboard, so they belong here.

Coefficient 1.6 may be adjusted via a balance patch as real data accumulates.

### Creator post score

Admin-granted points via `ecosystem-bonus-creator-posts` category (1-30 pts per post,
set in `creator-posts-admin.ts` Lambda). Users with creator posts but zero on-chain
activity still appear on the leaderboard (FULL OUTER JOIN between sub-queries).

### Staking emission score

Rewards stakers for their daily epoch reward accumulation. Each day at UTC 01:00, the
scanner reads `suix_getStakes`'s `estimatedReward` for every staking identity, computes
the delta vs. the previous day's saved value, and inserts a `staking-reward` row with:

```
final_points = STAKING_EMISSION_COEFF * LOG2(delta_mist + 1)
tx_timestamp = yesterday (so week-boundary attribution is correct)
tx_digest    = stkr:{identityId}:{yesterdayStr}  (ON CONFLICT DO NOTHING)
```

The LOG2 pre-computation means the leaderboard SQL simply sums `final_points` — no
re-application of LOG in SQL. Cold start: first scan saves the baseline only, so
historical accumulation is not credited at once. Partial RPC failure: state is updated
but award is skipped that day to avoid inflated delta on the next run.

Expected score contribution: ~0.7-2.0 pts/day depending on stake size (~5-14 pts/week).

**Important**: only the LOG2-based `staking-reward` category feeds this leaderboard. The
tier-based `staking-daily` category (1-500 NSN: 1pt, 501-5000: 2pt, 5001+: 3pt; cutoff
2026-04-14) is **excluded** from `weekly_score` — it only contributes to the user's
individual cumulative ecosystem points, not to ranking.

Config: `apps/network-explorer/api-server/src/config/points.ts`
- `STAKING_EMISSION_COEFF = 0.07`
- `STAKING_EMISSION_CUTOFF_DATE = '2026-04-21'`

State table: `staking_emission_state` (`nasun_points` DB, `identity_id PK`, `last_total_mist NUMERIC`).

### What multipliers do NOT affect

Leaderboard score and rank. NFT multipliers apply only to per-row `final_points`
in `activity_points` (Ecosystem Points ledger), not to the leaderboard formula.

Current multiplier policy (see `apps/network-explorer/api-server/src/config/ecosystem.ts`,
all env-overridable):

- Base tier (highest wins, not additive): Alliance `1.0x`, Genesis Pass `2.0x`.
  No active NFT → multiplier `0` (points disabled).
- Battalion stack (additive on top of base): `+5.0` per unit, max 10 units.
- Final = `min(baseTier + battalionStack, MAX_MULTIPLIER=20.0)`.

---

## Week Boundaries

Reset cadence: every **Monday 00:00 UTC** (midnight, same boundary as Pado Score
Leaderboard).

### Week ID format

ISO 8601 Thursday-anchor: `YYYY-Wnn` (e.g. `2026-W17`).

The Thursday-anchor rule means the week containing January 4 is always Week 1.
This is the same algorithm used in `chat-server/leaderboard-store.ts`.

### Computing week bounds

```typescript
// 1. Find Jan 4 of the ISO year (always in Week 1)
const jan4 = new Date(Date.UTC(year, 0, 4));
const jan4Day = jan4.getUTCDay() || 7;           // Mon=1..Sun=7
const week1Monday = jan4 - (jan4Day - 1) days;   // backtrack to Monday
const weekMonday = week1Monday + (week - 1) * 7 days;

// 2. Week starts exactly at Monday midnight UTC (no offset)
const start = weekMonday;
const end   = start + 7 days;
```

### activeDays calculation (epoch-based)

Epoch-based day slots are used instead of calendar `date_trunc('day', ...)` to ensure
timezone-independent, deterministic slot assignment regardless of UTC boundary alignment:

```sql
FLOOR(
  (EXTRACT(EPOCH FROM tx_timestamp) - EXTRACT(EPOCH FROM :week_start))
  / 86400
)::int AS day_slot
```

Slots 0-6 guarantee `active_days <= 7` for any week.

---

## Database

### Source table: `activity_points` (PostgreSQL, `nasun_points` DB)

The leaderboard queries this table directly (no materialized view).

Key columns used:

| Column         | Type        | Purpose                                            |
| -------------- | ----------- | -------------------------------------------------- |
| `identity_id`  | TEXT        | Cognito identity ID (`region:uuid`)                |
| `tx_timestamp` | TIMESTAMPTZ | When the activity occurred                         |
| `category`     | TEXT        | Activity type                                      |
| `final_points` | NUMERIC     | Points awarded (used only for creator-posts score) |
| `flagged`      | BOOLEAN     | Excluded from all scoring when true                |

### Supporting index

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ap_timestamp_category_flagged
  ON activity_points(tx_timestamp, category)
  WHERE NOT flagged AND identity_id IS NOT NULL;
```

Covers the week-range scan + category filter + flagged exclusion used by both CTEs
in the leaderboard query. Added in the 2026-04-18 redesign.

### Materialized view: `ecosystem_daily_scores` (unchanged)

This matview is NOT used by the leaderboard. It continues to power the
`/ecosystem/score/:identityId` endpoint (my-account page ecosystem points display),
which still applies NFT multipliers.

---

## API Endpoints

Base URL: `https://explorer.nasun.io/api/v1`

All endpoints require no authentication. Rate limit: 60 req/min per IP.

### GET /ecosystem/leaderboard

Returns the ranked leaderboard for a given week.

**Query parameters:**

| Parameter | Type   | Default      | Description                                                                                       |
| --------- | ------ | ------------ | ------------------------------------------------------------------------------------------------- |
| `weekId`  | string | current week | ISO 8601 week ID (`YYYY-Wnn`). Invalid format is silently ignored and falls back to current week. |
| `limit`   | number | 50           | Page size. Snapped to nearest of [25, 50, 100, 200].                                              |
| `offset`  | number | 0            | Pagination offset. Max 10000.                                                                     |

**Response:**

```json
{
  "data": [
    {
      "identityId": "ap-northeast-2:uuid",
      "activityScore": 17,
      "creatorPostScore": 114.0,
      "weeklyScore": 131.0,
      "activeDays": 6,
      "rank": 1
    }
  ],
  "meta": {
    "weekId": "2026-W16",
    "weekStart": 1776039000000,
    "limit": 50,
    "offset": 0,
    "total": 31857,
    "updatedAt": 1745006400000
  }
}
```

**Error responses:**

| Status | Error                   | Cause                                                          |
| ------ | ----------------------- | -------------------------------------------------------------- |
| 400    | `invalid_week_id`       | weekId format valid but week number out of range (W00 or W54+) |
| 503    | `points_not_configured` | `POINTS_DATABASE_URL` env var not set                          |

**Caching:** Server-side in-memory cache keyed by `eco-leaderboard-${weekId}`, 5-minute TTL.
HTTP response: `Cache-Control: public, max-age=300`.

**SQL summary:**

```sql
WITH week_activities AS (
  SELECT DISTINCT identity_id,
    FLOOR((EXTRACT(EPOCH FROM tx_timestamp) - EXTRACT(EPOCH FROM :week_start)) / 86400)::int AS day_slot,
    category
  FROM activity_points
  WHERE NOT flagged AND identity_id IS NOT NULL
    AND tx_timestamp >= :week_start AND tx_timestamp < :week_end
    AND category NOT IN ('referral-bonus','daily-mission','ecosystem-passive','staking-daily','staking','staking-reward')
    AND category NOT LIKE 'ecosystem-bonus-%'
    AND category NOT LIKE 'pado-%'
),
activity_score AS (
  SELECT identity_id,
    COUNT(*)::int AS activity_score,
    COUNT(DISTINCT day_slot)::int AS active_days
  FROM week_activities GROUP BY identity_id
),
creator_post_score AS (
  SELECT identity_id, COALESCE(SUM(final_points), 0) / 5.0 AS post_score
  FROM activity_points
  WHERE category = 'ecosystem-bonus-creator-posts' AND NOT flagged
    AND identity_id IS NOT NULL
    AND tx_timestamp >= :week_start AND tx_timestamp < :week_end
  GROUP BY identity_id
),
bonus_score AS (
  SELECT identity_id,
    COALESCE(SUM(final_points) FILTER (WHERE category IN ('ecosystem-bonus-bugreport','ecosystem-bonus-feedback')), 0) / 2.0
    + COALESCE(SUM(final_points) FILTER (WHERE category = 'ecosystem-bonus-game'), 0) / 3.0 AS bonus_score
  FROM activity_points
  WHERE category IN ('ecosystem-bonus-bugreport','ecosystem-bonus-feedback','ecosystem-bonus-game')
    AND NOT flagged AND identity_id IS NOT NULL
    AND tx_timestamp >= :week_start AND tx_timestamp < :week_end
  GROUP BY identity_id
),
volume_score AS (
  SELECT identity_id, COUNT(*)::int AS volume_count
  FROM activity_points
  WHERE category IN ('pado-lottery','pado-games','pado-scratchcard','wallet-transfer')
    AND NOT flagged AND identity_id IS NOT NULL
    AND tx_timestamp >= :week_start AND tx_timestamp < :week_end
  GROUP BY identity_id
),
staking_emission AS (
  SELECT identity_id, COALESCE(SUM(final_points), 0)::float8 AS emission_score
  FROM activity_points
  WHERE category = 'staking-reward' AND NOT flagged AND identity_id IS NOT NULL
    AND tx_timestamp >= :week_start AND tx_timestamp < :week_end
  GROUP BY identity_id
)
SELECT
  COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id, se.identity_id) AS identity_id,
  COALESCE(a.activity_score, 0)::int AS activity_score,
  COALESCE(c.post_score, 0) AS creator_post_score,
  COALESCE(b.bonus_score, 0) AS bonus_score,
  COALESCE(a.active_days, 0)::int AS active_days,
  COALESCE(v.volume_count, 0)::int AS volume_count,
  COALESCE(se.emission_score, 0)::float8 AS emission_score,
  (
    COALESCE(a.activity_score, 0)
    + COALESCE(c.post_score, 0)
    + COALESCE(b.bonus_score, 0)
    + 1.6 * LOG(2, COALESCE(v.volume_count, 0) + 1)
    + COALESCE(se.emission_score, 0)
  )::float8 AS weekly_score
FROM activity_score a
FULL OUTER JOIN creator_post_score c ON a.identity_id = c.identity_id
FULL OUTER JOIN bonus_score b ON COALESCE(a.identity_id, c.identity_id) = b.identity_id
FULL OUTER JOIN volume_score v ON COALESCE(a.identity_id, c.identity_id, b.identity_id) = v.identity_id
FULL OUTER JOIN staking_emission se ON COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id) = se.identity_id
ORDER BY weekly_score DESC, identity_id ASC
```

The `identity_id ASC` tiebreaker ensures deterministic ranking when scores are equal.

### GET /ecosystem/leaderboard/weeks

Returns available week IDs in descending order (most recent first).

**Response:**

```json
{
  "weeks": [
    { "weekId": "2026-W16", "label": "2026-W16 (current)" },
    { "weekId": "2026-W15", "label": "2026-W15 (Apr 6 - Apr 12)" },
    ...
  ]
}
```

**Logic:** Queries `MIN(tx_timestamp)` from `activity_points`, then iterates backward
from now one week at a time. Stops when `week_start < floor_date`. The floor date is
`2025-01-01T00:00:00Z` (`ECOSYSTEM_LEADERBOARD_FLOOR_DATE`) to prevent stale staging
data from inflating the list.

**Caching:** `Cache-Control: public, max-age=3600`.

---

## Frontend

### Route

`/community/nasun-ecosystem-leaderboard`

Component: `apps/nasun-website/frontend/src/pages/ecosystem/EcosystemLeaderboardPage.tsx`

### State

```
viewMode: "current" | "past"
selectedWeekId: string | undefined   (past weeks only)
availableWeeks: AvailableEcosystemWeek[]  (loaded once on mount)
response: EcosystemLeaderboardResponse | null
offset: number
```

### Week selector behavior

- On mount: `getAvailableEcosystemWeeks()` loads the week list.
- `availableWeeks[0]` is the current week; `availableWeeks.slice(1)` are past weeks.
- Switching to "Past Weeks" tab auto-selects the most recent past week if no week was
  previously selected.
- Switching back to "Current Week" passes `weekId=undefined` to the API (server defaults
  to current week).

### Grace period

When the week just reset (within 12 hours of `weekStart`), `isEcosystemNewWeekGracePeriod(meta)`
returns true and the UI shows a "Week just reset. Scores are updating..." notice.

```typescript
// apps/nasun-website/frontend/src/services/ecosystemScoreApi.ts
export const ECOSYSTEM_WEEK_GRACE_PERIOD_MS = 12 * 60 * 60 * 1000;

export function isEcosystemNewWeekGracePeriod(
  meta: EcosystemLeaderboardResponse["meta"] | undefined,
): boolean {
  if (!meta?.weekStart || !meta?.updatedAt) return false;
  return meta.updatedAt - meta.weekStart < ECOSYSTEM_WEEK_GRACE_PERIOD_MS;
}
```

### Table columns

| Column         | Source field       | Notes                                               |
| -------------- | ------------------ | --------------------------------------------------- |
| Rank           | `rank`             | Computed server-side as `offset + i + 1`            |
| User           | `identityId`       | Truncated: `...{last 8 chars of UUID}`              |
| Activity Score | `activityScore`    | Distinct (day_slot, category) pairs                 |
| Creator Posts  | `creatorPostScore` | Highlighted in teal if > 0, "-" otherwise           |
| Active Days    | `activeDays`       | `{n}/7` format                                      |
| Score          | `weeklyScore`      | full formula sum, 3 decimal places                  |

### Admin dashboard

`apps/nasun-website/frontend/src/features/admin/pages/ActivityPointsAdmin.tsx`

Always shows the current week (no period tabs). Columns: Weekly Score, Activity,
Creator Posts, Active Days. Augments entries with user profile data (X handle, avatar)
via `listUsers()`.

---

## Server Deployment

The `explorer-api` process runs on the indexer server (separate from the main prod EC2):

- **Server:** `ubuntu@54.180.61.196` (SSH key: `~/.ssh/.awskey/nasun-devnet-key.pem`)
- **Process manager:** PM2, process name `explorer-api` (id: 5)
- **Deploy path:** `~/explorer-api/`
- **Port:** 3200 (proxied by nginx on `explorer.nasun.io` prod EC2)
- **Build:** `npm run build` (runs `tsc`)
- **Restart:** `pm2 restart explorer-api`

Deployment is manual rsync (not git-based):

```bash
rsync -avz -e "ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem" \
  apps/network-explorer/api-server/src/routes/ecosystem.ts \
  ubuntu@54.180.61.196:~/explorer-api/src/routes/ecosystem.ts

ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196 \
  "cd ~/explorer-api && npm run build && pm2 restart explorer-api"
```

Note: `npm run build` may emit a TS error from `src/scripts/rpc-reconcile.ts`
(pre-existing, unrelated to the API server). The `dist/routes/ecosystem.js` is still
compiled correctly despite this error.

---

## Weekly Settlement (Ecosystem Points payout)

**Script:** `apps/network-explorer/api-server/src/scripts/settle-ecosystem.ts`

Automatically run via cron (Monday 00:20 UTC) after the week ends. Settles a *completed*
ISO week only — refuses the current in-progress week. Manual invocation when needed:

```bash
cd ~/explorer-api && set -a && source .env && set +a
AWS_PROFILE=nasun-prod npx tsx src/scripts/settle-ecosystem.ts --week auto
AWS_PROFILE=nasun-prod npx tsx src/scripts/settle-ecosystem.ts --week 2026-W17 --dry-run
```

The script reproduces the same SQL + JS tiebreaker order used by
`GET /ecosystem/leaderboard` (weekly_score → activity_score → isTelegramMember
→ hasGenesisPass → identity_id), assigns `rank = idx + 1`, then awards
Ecosystem Points to top 2000.

**Eligibility (all must hold):**
- `identityId` resolvable (registered Cognito identity)
- Active Alliance NFT (from `ECOSYSTEM_ACTIVATIONS_URL`)
- Wallet address resolvable from `WALLET_MAPPINGS_URL` (required by
  `activity_points.wallet_address NOT NULL`)
- Rank ≤ 2000

> **Policy update (2026-04-27)**: the social account requirement (Twitter / Google /
> Telegram) was removed. The `hasSocialAccount` filter no longer gates settlement.
> Profile flags are still fetched from DynamoDB `UserProfiles` BatchGet to reproduce
> the same `isTelegramMember` JS tiebreaker the `/leaderboard` API applies, but the
> result no longer affects payout eligibility.

**Reward table (mirrors settle-pado.ts):**

| Rank | Base | Genesis Pass (2x) |
|------|------|-------------------|
| 1 | 50 | 100 |
| 2 | 45 | 90 |
| 3 | 40 | 80 |
| 4–10 | 35 | 70 |
| 11–20 | 30 | 60 |
| 21–50 | 25 | 50 |
| 51–100 | 20 | 40 |
| 101–200 | 15 | 30 |
| 201–300 | 10 | 20 |
| 301–500 | 8 | 16 |
| 501–1000 | 6 | 12 |
| 1001–2000 | 5 | 10 |

**Idempotency / safety:**
- Snapshot table `weekly_ecosystem_snapshots` (week_id, identity_id PK) records
  rank + score at first run. Re-runs skip rows with `settled = 1`.
- Atomic per-row PG transaction: `INSERT activity_points` + `UPDATE settled = 1`.
- `INSERT activity_points` uses `ON CONFLICT (tx_digest, activity_type, event_seq)
  DO NOTHING` for full re-run safety.
- Aborts if the Alliance set is empty (suspected API outage).
- Refuses to settle the current in-progress week.

**Resulting `activity_points` row:**

| Column | Value |
|--------|-------|
| `category` | `ecosystem-bonus-leaderboard` |
| `activity_type` | `weekly-${weekId}` (e.g. `weekly-2026-W17`) |
| `tx_digest` | `bonus-ecosystem-weekly:${identityId}:${weekId}` |
| `base_points` | rank-based base |
| `genesis_multiplier` | 2.0 if Genesis Pass holder else 1.0 |
| `final_points` | `base_points * genesis_multiplier` |

The `ecosystem-bonus-*` prefix is required so the bonus does **not** feed back
into next week's `activity_score` (the leaderboard SQL excludes
`category LIKE 'ecosystem-bonus-%'`).

---

## Known Limitations and Open Issues

### identityId exposure in public API (GitHub Issue #1)

The leaderboard response exposes raw Cognito identityIds (`region:uuid`) to unauthenticated
callers. This enables mass enumeration of internal user identifiers, which can be used
to scrape per-user score data from `/score/:identityId`. Not a credential leak, but
violates minimal disclosure.

Fix: replace `identityId` in leaderboard responses with `SHA256(identityId).slice(0,16)`.
Blocked by components that reference `identityId` directly from leaderboard entries.

Tracked: https://github.com/narunice/nasun-monorepo/issues/1

### CORS allowlist on wallet score redirect

`GET /score/wallet/:address` returns a 302 to `/score/:identityId`. The CORS header on
the redirect response is explicitly set (nginx strips middleware CORS headers on
redirects). This is now correctly restricted to the server allowlist after the
2026-04-18 fix.

---

## Related Files

| File                                                                           | Purpose                                         |
| ------------------------------------------------------------------------------ | ----------------------------------------------- |
| `apps/network-explorer/api-server/src/routes/ecosystem.ts`                     | All leaderboard API logic                       |
| `apps/network-explorer/api-server/src/scripts/settle-ecosystem.ts`             | Weekly Ecosystem Points settlement (top 2000)   |
| `apps/network-explorer/api-server/src/db/ecosystem-schema.sql`                 | DB schema, indexes, matview                     |
| `apps/nasun-website/frontend/src/services/ecosystemScoreApi.ts`                | Client API types and functions                  |
| `apps/nasun-website/frontend/src/pages/ecosystem/EcosystemLeaderboardPage.tsx` | Public leaderboard page                         |
| `apps/nasun-website/frontend/src/features/admin/pages/ActivityPointsAdmin.tsx` | Admin dashboard                                 |
| `apps/network-explorer/api-server/src/config/ecosystem.ts`                     | NFT multiplier config (not used by leaderboard) |
| `apps/network-explorer/api-server/src/scanner/ecosystem-cache.ts`              | NFT activation cache (not used by leaderboard)  |
