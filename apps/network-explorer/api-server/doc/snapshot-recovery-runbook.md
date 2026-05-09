# Snapshot Recovery Runbook

Manual recovery procedures for daily ecosystem snapshot failures. The system is designed to self-recover within the same UTC day via the 60s scanLoop retry (P0 fix, 2026-05-09); these procedures cover cases where that automatic recovery has not been enough.

## Trigger signals

You will get a Telegram alert in the configured channel when one of the following fires:

- `Snapshot YYYY-MM-DD blocked: N NFT holders missing health row` — the daily snapshot is being aborted because some recently-activated NFT holders are missing their first `nft_health_state` row.
- `Snapshot YYYY-MM-DD aborted: matview/live mismatch` — the matview is significantly ahead of the activity_points raw scan.
- `Activations cache refresh failed after retries` — the admin-api `ECOSYSTEM_ACTIVATIONS_URL` is failing repeatedly.
- `Snapshot freshness: yesterday=YYYY-MM-DD not found` — the dead-man-switch (cron) found no row for yesterday.
- `Snapshot freshness: yesterday=YYYY-MM-DD has only N rows (expected >= 1000)` — partial snapshot detected.

## Diagnosis (first 5 minutes)

SSH to node-3:

```bash
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196
```

Quick state check:

```bash
# Recent scanner activity
pm2 logs explorer-api --lines 200 --nostream --err 2>&1 | grep -E '\[Snapshot\]|\[Reconcile\]|\[Health\]|\[Ecosystem\]' | tail -50

# Snapshot row counts for the last week
cd ~/explorer-api && set -a && . ./.env && set +a
node --input-type=module -e "
  import postgres from 'postgres';
  const p = postgres(process.env.POINTS_DATABASE_URL || process.env.DATABASE_URL);
  const r = await p\`SELECT snapshot_date::text d, COUNT(*) c FROM ecosystem_score_snapshots WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days' GROUP BY 1 ORDER BY 1\`;
  console.table(r);
  await p.end();
"
```

A healthy state shows ~60K rows per day with day-over-day variance under a few percent. A row count below 1K or absent rows for yesterday is the indicator to act on.

## Common scenarios

### A. Health rows missing for a small number of holders

Symptom: `Health missing for N NFT holders` repeats.

Root cause: usually freshly-activated alliance/GP holders whose `nft_health_state` row hasn't been created yet because the upstream activations fetch or `daily-nft-check` failed during the relevant scanLoop tick.

Recovery:

1. Wait one or two scanLoop cycles (~2 minutes). Most cases self-heal.
2. If still stuck after ~10 minutes, identify the missing holders and seed default rows that mirror what `health-update.ts` would have computed:

```bash
cd ~/explorer-api && set -a && . ./.env && set +a
node --input-type=module <<'EOF'
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';

const TARGET = process.argv[2] ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const cache = JSON.parse(gunzipSync(readFileSync('.cache/ecosystem-activations.json.gz')).toString());
const acts = cache.data?.activations || cache.activations;

const allianceIds = Object.entries(acts)
  .filter(([, v]) => Array.isArray(v) && v.some(a => a.nftType === 'alliance'))
  .map(([id]) => id);
const gpIds = new Set(
  Object.entries(acts).filter(([, v]) => Array.isArray(v) && v.some(a => a.nftType === 'genesis-pass')).map(([id]) => id),
);

const p = postgres(process.env.POINTS_DATABASE_URL || process.env.DATABASE_URL);
const have = new Set(
  (await p`SELECT DISTINCT identity_id FROM nft_health_state WHERE identity_id = ANY(${allianceIds}) AND last_evaluated_day <= ${TARGET}::date AND nft_type = 'alliance'`).map(r => r.identity_id)
);
const missing = allianceIds.filter(id => !have.has(id));
console.log(`Missing alliance health rows for ${TARGET}: ${missing.length}`);

if (missing.length > 0) {
  const activeRows = await p`
    SELECT DISTINCT identity_id FROM activity_points
    WHERE NOT flagged
      AND tx_timestamp >= ${TARGET}::date AND tx_timestamp < (${TARGET}::date + interval '1 day')
      AND identity_id = ANY(${missing})
      AND category NOT IN ('referral-bonus','daily-mission','ecosystem-passive')
  `;
  const activeSet = new Set(activeRows.map(r => r.identity_id));

  const ids = [], types = [], healths = [], rests = [], lastActives = [];
  for (const id of missing) {
    const isActive = activeSet.has(id);
    const hasGp = gpIds.has(id);
    if (hasGp)         { healths.push(100); rests.push(0); lastActives.push(isActive ? TARGET : null); }
    else if (isActive) { healths.push(100); rests.push(0); lastActives.push(TARGET); }
    else               { healths.push(75);  rests.push(1); lastActives.push(null); }
    ids.push(id); types.push('alliance');
  }
  const targets = ids.map(() => TARGET);

  const r = await p`
    INSERT INTO nft_health_state (identity_id, nft_type, health_pct, consecutive_rest_days, last_active_day, last_evaluated_day)
    SELECT * FROM unnest(
      ${p.array(ids)}::text[], ${p.array(types)}::text[], ${p.array(healths)}::numeric[],
      ${p.array(rests)}::int[], ${p.array(lastActives)}::date[], ${p.array(targets)}::date[]
    ) AS t(identity_id, nft_type, health_pct, consecutive_rest_days, last_active_day, last_evaluated_day)
    ON CONFLICT (identity_id, nft_type) DO UPDATE
      SET health_pct = EXCLUDED.health_pct, consecutive_rest_days = EXCLUDED.consecutive_rest_days,
          last_active_day = EXCLUDED.last_active_day, last_evaluated_day = EXCLUDED.last_evaluated_day, updated_at = NOW()
      WHERE nft_health_state.last_evaluated_day < EXCLUDED.last_evaluated_day
  `;
  console.log(`Inserted/updated: ${r.count}`);
}
await p.end();
EOF
```

3. After the insert, restart the scanner so `lastSnapshotDate` resets and the next scanLoop retries the snapshot:

```bash
pm2 restart explorer-api
```

4. Watch logs for ~2 minutes:

```bash
pm2 logs explorer-api --lines 50 --nostream --out 2>&1 | grep -E '\[Snapshot\]'
```

You should see `[Snapshot] N users snapshotted for YYYY-MM-DD` with `N` in the tens of thousands. If a small number of new holders appear and the alert returns, repeat the seed step (the cache refreshes on each scanLoop and may pick up additional new activations).

### B. Snapshot for an older date is missing

Symptom: dead-man-switch alert says yesterday's row not found, the gap is more than one day, or the count is partial.

Recovery: the existing `backfill-snapshot-day.ts` script handles dates older than today-1. **It deliberately refuses today and yesterday** so it doesn't race the live scanner. For yesterday, follow scenario A first; only after that fails should you consider a yesterday-targeted backfill, and then only with the scanner stopped.

```bash
cd ~/explorer-api && set -a && . ./.env && set +a
# Auto-detect missing dates in the last 3 days (excluding today and yesterday)
node dist/scripts/backfill-snapshot-day.js --auto

# Or target a specific date
node dist/scripts/backfill-snapshot-day.js --date 2026-05-06
```

Verify:

```bash
node --input-type=module -e "
  import postgres from 'postgres';
  const p = postgres(process.env.POINTS_DATABASE_URL || process.env.DATABASE_URL);
  console.table(await p\`SELECT snapshot_date::text d, COUNT(*) c FROM ecosystem_score_snapshots WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days' GROUP BY 1 ORDER BY 1\`);
  await p.end();
"
```

### C. Activations cache stuck on disk fallback

Symptom: `Activations cache refresh failed after retries`, or holder counts stuck at an old number.

Diagnosis: the admin-api at `ECOSYSTEM_ACTIVATIONS_URL` is failing or returning malformed responses. Check directly:

```bash
curl -sS -H "x-api-key: $ECOSYSTEM_ACTIVATIONS_API_KEY" "$ECOSYSTEM_ACTIVATIONS_URL" | head -c 200
```

If the upstream is unhealthy, fix that first (separate component, often nasun-website CDK Lambda). The scanner will resume on its own once the upstream recovers. The disk fallback in `.cache/ecosystem-activations.json.gz` keeps the snapshot pipeline limping along with the last known good cache.

## Hard "do not" list

- **Do not** insert default `multiplier=0` rows for missing health holders. That violates the all-or-nothing principle (a 0-multiplier row is permanent under `ON CONFLICT DO NOTHING`).
- **Do not** delete rows from `ecosystem_score_snapshots`. The integrity guard does not currently cover this table, but the same principle applies: snapshots are append-only.
- **Do not** call `backfill-snapshot-day.js --date <yesterday>` while the scanner is running. The script's own guard refuses, but bypassing it races the live cron path.
- **Do not** silence Telegram alerts to make them stop. They mean a real user-visible chart is broken.

## Aftermath

After any manual recovery, write a short note in the project memory describing what happened and which scenario above applied, so the next operator has the same playbook with one more data point.
