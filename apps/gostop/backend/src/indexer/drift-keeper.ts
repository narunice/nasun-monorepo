/**
 * Periodic drift keeper — Tier 1 post-cleanup §10.D.
 *
 * Runs alongside risk-alert (inline in the indexer process). Polls three
 * operational drift conditions every DRIFT_KEEPER_INTERVAL_MS and fires
 * a Telegram alert when any threshold is crossed:
 *
 *   1. reconciler_stall_severe
 *      Number of bankroll_event rows whose `total_shares_after` is still
 *      NULL exceeds DRIFT_RECONCILER_STALL_THRESHOLD (500). The Risk
 *      Dashboard data_quality enum already degrades at 100 (lagging) and
 *      1000 (unreliable); 500 is a midpoint that wakes operators before the
 *      public UI flips to "unreliable" but after a transient burst (e.g. an
 *      RPC 503 wave) has had time to clear on its own.
 *
 *   2. chain_divergence
 *      Chain `pool.total_shares` differs from the most-recent reconciled
 *      `total_shares_after` while the reconciler backlog is small enough
 *      that the gap cannot be explained by work still in flight. Real
 *      divergence points to a missed event, an indexer cursor reset gone
 *      wrong, or a chain rollback.
 *
 *      This originally required the whole `total_shares_after IS NULL`
 *      backlog to be empty, which made the check unreachable in practice:
 *      that backlog is dominated by `open_exposure_snapshot` rows, emitted on
 *      every bet and settlement and incapable of moving a share count, so on
 *      an active pool it is essentially never zero. Nothing else covered the
 *      gap either, since `data_quality` stays 'fresh' to 100 rows. It went
 *      unnoticed until 2026-09-13, when the DB tail was found carrying 2.74x
 *      the chain's share count with no alert ever having fired.
 *
 *      The gate now counts only the three share-affecting event types, where
 *      an empty backlog is the exact statement of "nothing in flight can
 *      explain this gap". A share-affecting row that wedges permanently is
 *      covered by cursor_lag_severe rather than by silencing this alert.
 *
 *   3. cursor_lag_severe
 *      Oldest unreconciled bankroll_event row is more than DRIFT_OLDEST_
 *      ROW_AGE_MS old (1 hour). Catches the case where unreconciled COUNT
 *      stays below the stall threshold but rows pile up without being
 *      drained because every recent tick failed.
 *
 * Why inline (not separate pm2 process): same rationale as risk-alert.ts —
 * the indexer is already running, this work is cents-on-the-cycle, and
 * isolating to its own pm2 process would entangle with the node-3
 * ecosystem.config.cjs runtime (already reconciled but historically drift-
 * prone). The indexer process is the right home.
 *
 * Cooldown matches risk-alert: 30 min per alert key, no "all clear" message
 * to keep channel signal-to-noise high.
 */

import { alertingEnabled, sendTelegram } from './telegram.js';
import { reader } from '../db/client.js';
import { rpcCall } from '../rpc.js';
import { BANKROLL_POOL } from '../config/contracts.js';

const DRIFT_KEEPER_INTERVAL_MS = 5 * 60_000;
const DRIFT_KEEPER_COOLDOWN_MS = 30 * 60_000;

/** Unreconciled row count over this triggers reconciler_stall_severe. */
const DRIFT_RECONCILER_STALL_THRESHOLD = 500;

/** Oldest unreconciled row age over this triggers cursor_lag_severe. */
const DRIFT_OLDEST_ROW_AGE_MS = 60 * 60_000;

/**
 * The only event types that move `total_shares_after`. Mirrors the three
 * mutating branches of bankroll-reconciler's `applySharesDelta`; every other
 * type carries the running total forward unchanged.
 *
 * The divergence check counts backlog in these types alone. A raw
 * `total_shares_after IS NULL` count is dominated by `open_exposure_snapshot`,
 * which the pool emits on every collect_bet / pay_winner / refund_bet and
 * which cannot explain a share-count gap.
 */
const SHARE_AFFECTING_EVENT_TYPES = [
  'liquidity_provided',
  'liquidity_redeemed',
  'shares_seeded',
] as const;

type AlertKey =
  | 'reconciler_stall_severe'
  | 'chain_divergence'
  | 'cursor_lag_severe';

const lastFired = new Map<AlertKey, number>();
let intervalHandle: NodeJS.Timeout | null = null;



function shouldFire(key: AlertKey, now: number): boolean {
  const last = lastFired.get(key);
  if (last === undefined) return true;
  return now - last >= DRIFT_KEEPER_COOLDOWN_MS;
}

async function fetchChainTotalShares(): Promise<bigint | null> {
  try {
    const res = await rpcCall<{
      data?: {
        content?: {
          fields?: { total_shares?: string | number };
        };
      };
    }>('sui_getObject', [
      BANKROLL_POOL.bankrollPoolObjectId,
      { showContent: true },
    ]);
    const ts = res?.data?.content?.fields?.total_shares;
    if (ts === undefined) return null;
    return BigInt(String(ts));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[drift-keeper] sui_getObject failed: ${msg}`);
    return null;
  }
}

/**
 * The gap this tick observed, held so the next tick can decide whether it was
 * real. Null when the previous tick saw no gap.
 */
let pendingDivergence: { chain: bigint; db: bigint } | null = null;

/**
 * Require a divergence to survive one full interval before paging.
 *
 * The two sides are read at different instants, and the lagging side is the DB:
 * an event already applied on chain has not necessarily been inserted into
 * bankroll_event yet. That case is invisible to the backlog gate above, because
 * a row that does not exist contributes nothing to `unreconciledShareRows`.
 *
 * An immediate second read cannot separate the two — it lands milliseconds
 * later while the indexer polls on a multi-second cycle, so it returns the same
 * tail and confirms its own false positive. What does separate them is time:
 * indexer lag closes within an interval, a missed event or a cursor reset does
 * not. So the first sighting only arms, and the alert fires when the next tick
 * sees the identical pair.
 *
 * Comparing the pair, not just "still mismatched", matters: if either side
 * moved between ticks the pool was active and the reading is a different
 * observation, not a confirmation of this one.
 *
 * Known limit: `pendingDivergence` is in-process, so an indexer restart between
 * the two ticks disarms and the gap needs another interval to re-confirm. That
 * costs latency on a real divergence, never a false page, which is the right
 * direction for an alert whose text is "manual investigation required".
 */
function confirmDivergence(chainTotalShares: bigint, dbTotalShares: bigint): boolean {
  const prev = pendingDivergence;
  pendingDivergence = { chain: chainTotalShares, db: dbTotalShares };
  if (prev === null) {
    console.log(
      '[drift-keeper] divergence armed, awaiting confirmation next tick '
        + `(chain=${chainTotalShares} db=${dbTotalShares})`,
    );
    return false;
  }
  if (prev.chain !== chainTotalShares || prev.db !== dbTotalShares) {
    console.log('[drift-keeper] divergence not confirmed — both sides moved, re-arming');
    return false;
  }
  return true;
}

/** Clear the latch once the two sides agree again. */
function clearPendingDivergence(): void {
  if (pendingDivergence !== null) {
    console.log('[drift-keeper] divergence cleared — chain and DB agree');
    pendingDivergence = null;
  }
}

export interface DbDriftStats {
  unreconciledRows: number;
  /** Subset of `unreconciledRows` in SHARE_AFFECTING_EVENT_TYPES. */
  unreconciledShareRows: number;
  oldestUnreconciledAgeMs: number;
  latestReconciledTotalShares: bigint | null;
}

/**
 * Single round-trip view of the reconciler's drift state. Uses a CTE so the
 * three numbers come from one snapshot — avoids race between three
 * back-to-back queries.
 */
async function fetchDbDriftStats(): Promise<DbDriftStats> {
  const sql = reader();
  const rows = await sql<
    {
      unreconciled_rows: string;
      unreconciled_share_rows: string;
      oldest_age_ms: string;
      latest_total_shares: string | null;
    }[]
  >`
    WITH unreconciled AS (
      SELECT COUNT(*)::text AS cnt,
             COUNT(*) FILTER (
               WHERE event_type = ANY(${SHARE_AFFECTING_EVENT_TYPES as unknown as string[]})
             )::text AS share_cnt,
             COALESCE(
               (EXTRACT(EPOCH FROM now()) * 1000)::bigint - MIN(timestamp_ms),
               0
             )::text AS oldest_age_ms
      FROM gostop.bankroll_event
      WHERE total_shares_after IS NULL
    ),
    latest AS (
      SELECT total_shares_after::text AS total_shares
      FROM gostop.bankroll_event
      WHERE total_shares_after IS NOT NULL
      ORDER BY timestamp_ms DESC, id DESC
      LIMIT 1
    )
    SELECT unreconciled.cnt AS unreconciled_rows,
           unreconciled.share_cnt AS unreconciled_share_rows,
           unreconciled.oldest_age_ms,
           latest.total_shares AS latest_total_shares
    FROM unreconciled LEFT JOIN latest ON TRUE
  `;
  const row = rows[0];
  return {
    unreconciledRows: Number(row?.unreconciled_rows ?? '0'),
    unreconciledShareRows: Number(row?.unreconciled_share_rows ?? '0'),
    oldestUnreconciledAgeMs: Number(row?.oldest_age_ms ?? '0'),
    latestReconciledTotalShares: row?.latest_total_shares
      ? BigInt(row.latest_total_shares)
      : null,
  };
}

/**
 * One drift-keeper cycle. Exported for tests + manual invocation.
 */
export async function runDriftKeeperOnce(): Promise<void> {
  if (!alertingEnabled()) return;

  let db: DbDriftStats;
  try {
    db = await fetchDbDriftStats();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[drift-keeper] fetchDbDriftStats failed: ${msg}`);
    return;
  }

  const chainTotalShares = await fetchChainTotalShares();
  const now = Date.now();

  // 1. Reconciler stall — too many unreconciled rows.
  if (db.unreconciledRows > DRIFT_RECONCILER_STALL_THRESHOLD) {
    if (shouldFire('reconciler_stall_severe', now)) {
      const text = [
        'GoStop Bankroll — reconciler stall',
        '',
        `Unreconciled rows: ${db.unreconciledRows.toLocaleString('en-US')} (threshold ${DRIFT_RECONCILER_STALL_THRESHOLD})`,
        `Oldest unreconciled age: ${Math.round(db.oldestUnreconciledAgeMs / 60_000)} min`,
        '',
        'Check indexer logs for repeated RPC failures or watermark gating issues.',
      ].join('\n');
      if (await sendTelegram('drift-keeper', text)) {
        lastFired.set('reconciler_stall_severe', now);
        console.log(`[drift-keeper] reconciler_stall_severe fired (${db.unreconciledRows} rows)`);
      }
    }
  }

  // 2. Cursor lag severe — oldest unreconciled row aged out.
  if (db.oldestUnreconciledAgeMs > DRIFT_OLDEST_ROW_AGE_MS) {
    if (shouldFire('cursor_lag_severe', now)) {
      const text = [
        'GoStop Bankroll — cursor lag severe',
        '',
        `Oldest unreconciled row: ${Math.round(db.oldestUnreconciledAgeMs / 60_000)} min old (threshold ${Math.round(DRIFT_OLDEST_ROW_AGE_MS / 60_000)} min)`,
        `Unreconciled count: ${db.unreconciledRows}`,
        '',
        'A PnL stream watermark is wedged. Inspect indexer_cursor table + recent stream tick failures.',
      ].join('\n');
      if (await sendTelegram('drift-keeper', text)) {
        lastFired.set('cursor_lag_severe', now);
        console.log(`[drift-keeper] cursor_lag_severe fired (${db.oldestUnreconciledAgeMs}ms)`);
      }
    }
  }

  // 3. Chain divergence — meaningful once no share-affecting row is still in
  //    flight, since only those can explain a share-count gap, and once the gap
  //    has outlived one interval. See confirmDivergence for why an immediate
  //    re-read cannot tell indexer lag from a real gap.
  const chainDbGap =
    chainTotalShares !== null &&
    db.latestReconciledTotalShares !== null &&
    db.unreconciledShareRows === 0 &&
    chainTotalShares !== db.latestReconciledTotalShares;
  if (!chainDbGap) clearPendingDivergence();
  if (
    chainDbGap &&
    chainTotalShares !== null &&
    db.latestReconciledTotalShares !== null &&
    confirmDivergence(chainTotalShares, db.latestReconciledTotalShares)
  ) {
    if (shouldFire('chain_divergence', now)) {
      const text = [
        'GoStop Bankroll — chain divergence',
        '',
        `Chain total_shares: ${chainTotalShares.toString()}`,
        `DB latest reconciled: ${db.latestReconciledTotalShares.toString()}`,
        `Delta: ${(chainTotalShares - db.latestReconciledTotalShares).toString()}`,
        `Backlog: ${db.unreconciledShareRows} share-affecting / ${db.unreconciledRows} total`,
        `Persisted across two checks ${Math.round(DRIFT_KEEPER_INTERVAL_MS / 60_000)} min apart.`,
        '',
        'DB ≠ chain with no share-affecting row in flight to explain it. Possible missed event, cursor reset, or chain rollback. Manual investigation required.',
      ].join('\n');
      if (await sendTelegram('drift-keeper', text)) {
        lastFired.set('chain_divergence', now);
        console.log(
          `[drift-keeper] chain_divergence fired (chain=${chainTotalShares} db=${db.latestReconciledTotalShares})`,
        );
      }
    }
  }
}

/**
 * Boot from indexer entry. No-op when alerting env is unset; idempotent.
 */
export function startDriftKeeperLoop(): void {
  if (intervalHandle !== null) return;
  if (!alertingEnabled()) {
    console.log('[drift-keeper] disabled — TELEGRAM_BOT_TOKEN or TELEGRAM_ALERT_CHAT_ID not set');
    return;
  }
  console.log(
    `[drift-keeper] enabled — interval=${DRIFT_KEEPER_INTERVAL_MS / 1000}s cooldown=${DRIFT_KEEPER_COOLDOWN_MS / 60_000}min stall_threshold=${DRIFT_RECONCILER_STALL_THRESHOLD} rows oldest_age_threshold=${DRIFT_OLDEST_ROW_AGE_MS / 60_000}min`,
  );
  intervalHandle = setInterval(() => {
    void runDriftKeeperOnce();
  }, DRIFT_KEEPER_INTERVAL_MS);
  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }
}

/** Test-only — reset cooldown state between specs. */
export function _resetDriftKeeperStateForTests(): void {
  lastFired.clear();
}

/** Test-only — exported constants. */
export const _DRIFT_KEEPER_CONSTANTS = {
  DRIFT_KEEPER_INTERVAL_MS,
  DRIFT_KEEPER_COOLDOWN_MS,
  DRIFT_RECONCILER_STALL_THRESHOLD,
  DRIFT_OLDEST_ROW_AGE_MS,
  SHARE_AFFECTING_EVENT_TYPES,
};

/** Test-only — two-tick divergence latch and its reset. */
export { confirmDivergence as _confirmDivergence, clearPendingDivergence as _clearPendingDivergence };
