# Handoff: Scanner Stall + Matview Loss Incident (2026-04-12)

**Duration**: ~02:00~05:30 UTC (Apr 12 KST late night → Apr 13 KST)
**Severity**: High — user-visible (points not crediting), brief API 500 storm
**Trigger**: Bug report from @jeongseonmun2 about "trading/chat not crediting, missing 1 point daily"

## TL;DR

Two independent problems + one self-inflicted during repair:

1. Points scanner sat hung for 51 minutes (13:59~14:50 UTC) because a transient fullnode RPC blip caused an inner async call to never return. `scanLoop` never finished so `setTimeout` chain in `scheduleNext` never fired again. Manual `pm2 restart explorer-api` cleared it. Pre-restart the process looked healthy (API responding) — only the scanner component was dead.
2. Unrelated to #1: UI had advertised `pado-dex: +2 pts` since 2026-03-31, backend matview only scored it as +1 until `d2813a27` (2026-04-11 09:31 UTC). For ~11 days every user saw "8 expected, 7 actual" pattern. The original bug report conflated this with #1.
3. While shipping a fix for #1 I added an auto-migration that did `DROP MATERIALIZED VIEW ... CASCADE` then `CREATE` on scanner startup. The scanner's DB role lacks CREATE privilege on schema public, so CREATE failed, the error was caught silently, and the matview stayed dropped. API endpoints 500'd until a superuser ran psql manually to rebuild.

## What was deployed

Commits on main:
- `3a47e63c` fix(explorer): prevent scanner stalls and matview migration hazards
- `964bfc4b` fix(wallet-ui): recover from canceled OAuth in ZkLoginCallback
- `b466f6c2` perf(explorer): parallelize daily wallet-transfer RPC probes
- `0a7df40d` fix(explorer): restore 04-10 snapshots contaminated by alliance penalty reversal

Key behavioral changes in production:
- `scanLoop` is wrapped in a 3-minute timeout (`runScanLoopSafely`). On timeout the next iteration fires anyway so the scanner never goes permanently silent.
- A generation counter (`currentGeneration`) fences an abandoned loop at every `await` boundary so it can't rewind `last_tx_sequence` or double-count referral bonuses if it wakes up later.
- `scanTodayWalletTransfers` runs every loop, bounded to 500 wallets per iteration with a persistent round-robin cursor keyed on UTC date. RPC fan-out at concurrency 10. Full 100k-wallet coverage in ~20 min. Previously wallet-transfer was once-per-day only.
- Matview has a version marker (`matview_version=2`) in its `COMMENT`. Scanner startup only *reads* it and logs WARN on mismatch. A separate superuser CLI (`rebuildEcosystemMatview` in `ecosystem-matview-migration.ts`) does the actual rebuild via temp-name + atomic RENAME swap with `SET LOCAL lock_timeout = '5s'`.

## Data fixes applied live

**Apr 10 rank recovery**: 52,967 snapshot rows for 2026-04-10, only 1,375 had ranks assigned. The rest (51,592) were inserted by a one-off backfill script predating the re-rank logic that now lives in `rpc-reconcile.ts`, `backfill-dex.ts`, `backfill-from-indexer.ts`. Re-ranked 16,884 rows with `multiplier > 0` using `ROW_NUMBER() OVER (ORDER BY ecosystem_score DESC)`. Score values unchanged.

**Matview rebuild** (emergency after self-inflicted drop): ran as `sudo -u postgres` on node-3:
```sql
CREATE MATERIALIZED VIEW ecosystem_daily_scores AS
WITH distinct_cats AS (...)
SELECT identity_id, day, SUM(CASE WHEN category = 'pado-dex' THEN 2 ELSE 1 END)::int AS base_score
FROM distinct_cats GROUP BY identity_id, day;
-- + indexes + ALTER OWNER TO sui_indexer + COMMENT 'matview_version=2' + REFRESH
```

## Known remaining issues

- **`matview_version=2` is only in prod because we set it manually during emergency rebuild.** If someone bumps `MATVIEW_VERSION` in code to 3 and expects the automatic migration to handle it, they'll be surprised — only the startup check is automatic. Actual rebuild requires running the CLI as a superuser. Schema file `ecosystem-schema.sql` documents this but it's easy to miss.
- **The scanner's DB role.** `POINTS_DATABASE_URL` on node-3 uses a role named `postgres` with password auth. That role does NOT have `CREATE` on schema public. Matview is owned by `sui_indexer`. Any runtime DDL is going to fail the same way. Architectural decision: keep DDL strictly out of runtime code.
- **`fc4b0e72` staking exclusion retroactivity.** Excluding `staking` from base_score changed the formula for the matview. Since matview REFRESHes rebuild from current `activity_points`, historical base_score values silently decreased for users who staked. By design (forward-only was not possible here), but users who notice "my April 5 score got smaller" aren't wrong.
- **Matview REFRESH cadence** is 5~15 min (`MATVIEW_REFRESH_MIN_INTERVAL_MS` / `MAX_STALE_MS`). UI checklist updates in ~60s via RPC, pts today lags behind. Users often report this as "trading checked but points not going up." No current fix; could shorten to 1-2min but need to measure REFRESH cost on ~120k rows.

## Diagnostic cheatsheet for similar reports

1. Is the scanner advancing?
   ```
   ssh node-3
   cd ~/explorer-api && source .env
   psql "$POINTS_DATABASE_URL" -c "SELECT scanner_id, last_tx_sequence, NOW()-processed_at AS lag FROM processing_state;"
   ```
   Lag > 2min = scanner is dead or drowning. Check `pm2 logs explorer-api --err` for `scanLoop exceeded` or `ECONNREFUSED`.

2. Are this user's activities in activity_points?
   ```sql
   SELECT category, activity_type, tx_timestamp
   FROM activity_points
   WHERE identity_id = '<id>' AND tx_timestamp >= CURRENT_DATE
   ORDER BY tx_timestamp;
   ```

3. Does the matview reflect them?
   ```sql
   SELECT * FROM ecosystem_daily_scores WHERE identity_id='<id>' AND day = CURRENT_DATE;
   ```
   If activity_points has the row but matview doesn't, force a refresh:
   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY ecosystem_daily_scores;
   ```

4. Is the event actually being indexed?
   ```sql
   -- in sui_indexer DB
   SELECT module, type_name, COUNT(*) FROM event_struct_name
   WHERE sender = decode('<wallet-hex-no-0x>', 'hex')
     AND tx_sequence_number > (SELECT MAX(tx_sequence_number) - 100000 FROM events)
   GROUP BY 1, 2;
   ```

5. Chain reset detection:
   ```
   pm2 logs explorer-api --err | grep "Chain reset detection error"
   ```
   Recurrent = fullnode RPC (`localhost:9000`) unstable. Separate problem from scanner stall but can trigger it.

## References

- [apps/network-explorer/api-server/src/scanner/points-scanner.ts](apps/network-explorer/api-server/src/scanner/points-scanner.ts) — scanLoop, runScanLoopSafely, generation counter
- [apps/network-explorer/api-server/src/scanner/daily-nft-check.ts](apps/network-explorer/api-server/src/scanner/daily-nft-check.ts) — scanTodayWalletTransfers, probeWalletForTransfer, RPC_CONCURRENCY
- [apps/network-explorer/api-server/src/db/ecosystem-matview-migration.ts](apps/network-explorer/api-server/src/db/ecosystem-matview-migration.ts) — checkEcosystemMatviewVersion, rebuildEcosystemMatview CLI
- Previous related: [2026-04-12-points-audit-followup.md](2026-04-12-points-audit-followup.md)
