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

import { env } from '../env.js';
import { reader } from '../db/client.js';
import { rpcCall } from '../rpc.js';
import { BANKROLL_POOL } from '../config/contracts.js';

const DRIFT_KEEPER_INTERVAL_MS = 5 * 60_000;
const DRIFT_KEEPER_COOLDOWN_MS = 30 * 60_000;
const TELEGRAM_TIMEOUT_MS = 5_000;

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

function alertingEnabled(): boolean {
  return Boolean(env.alerts.telegramBotToken && env.alerts.telegramChatId);
}

async function sendTelegram(text: string): Promise<boolean> {
  if (!alertingEnabled()) return false;
  const url = `https://api.telegram.org/bot${env.alerts.telegramBotToken}/sendMessage`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.alerts.telegramChatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[drift-keeper] telegram non-ok ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[drift-keeper] telegram fetch failed: ${msg}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

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
 * Second look after a mismatch, to separate a real gap from a share event that
 * landed between this tick's DB and chain reads.
 *
 * The DB is re-read, not the chain. In the race the DB is the lagging side:
 * the event is already on chain and the indexer has not inserted it yet, so a
 * second chain read returns the same new value and would confirm its own
 * false positive. Only the DB catching up distinguishes the two.
 *
 * Returns false when the DB tail has since reached the chain value, or when a
 * share-affecting row has since appeared in the backlog (reconciliation now
 * demonstrably in flight) — either way the gap was transient. A failed re-read
 * also returns false: with no confirmation we do not page, and the next tick
 * tries again.
 */
async function confirmDivergence(
  chainTotalShares: bigint,
  readDb: () => Promise<DbDriftStats> = fetchDbDriftStats,
): Promise<boolean> {
  let recheck: DbDriftStats;
  try {
    recheck = await readDb();
  } catch (err) {
    console.warn(
      `[drift-keeper] divergence re-read failed; deferring to next tick: ${String(err)}`,
    );
    return false;
  }
  if (recheck.unreconciledShareRows > 0) {
    console.log('[drift-keeper] divergence not confirmed — share-affecting row now in flight');
    return false;
  }
  if (recheck.latestReconciledTotalShares === null) {
    console.log('[drift-keeper] divergence not confirmed — no reconciled tail on re-read');
    return false;
  }
  if (recheck.latestReconciledTotalShares === chainTotalShares) {
    console.log('[drift-keeper] divergence not confirmed — DB tail caught up');
    return false;
  }
  return true;
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
        '*GoStop Bankroll — reconciler stall*',
        '',
        `Unreconciled rows: *${db.unreconciledRows.toLocaleString('en-US')}* (threshold ${DRIFT_RECONCILER_STALL_THRESHOLD})`,
        `Oldest unreconciled age: ${Math.round(db.oldestUnreconciledAgeMs / 60_000)} min`,
        '',
        'Check indexer logs for repeated RPC failures or watermark gating issues.',
      ].join('\n');
      if (await sendTelegram(text)) {
        lastFired.set('reconciler_stall_severe', now);
        console.log(`[drift-keeper] reconciler_stall_severe fired (${db.unreconciledRows} rows)`);
      }
    }
  }

  // 2. Cursor lag severe — oldest unreconciled row aged out.
  if (db.oldestUnreconciledAgeMs > DRIFT_OLDEST_ROW_AGE_MS) {
    if (shouldFire('cursor_lag_severe', now)) {
      const text = [
        '*GoStop Bankroll — cursor lag severe*',
        '',
        `Oldest unreconciled row: *${Math.round(db.oldestUnreconciledAgeMs / 60_000)} min* old (threshold ${Math.round(DRIFT_OLDEST_ROW_AGE_MS / 60_000)} min)`,
        `Unreconciled count: ${db.unreconciledRows}`,
        '',
        'A PnL stream watermark is wedged. Inspect indexer_cursor table + recent stream tick failures.',
      ].join('\n');
      if (await sendTelegram(text)) {
        lastFired.set('cursor_lag_severe', now);
        console.log(`[drift-keeper] cursor_lag_severe fired (${db.oldestUnreconciledAgeMs}ms)`);
      }
    }
  }

  // 3. Chain divergence — meaningful once no share-affecting row is still in
  //    flight, since only those can explain a share-count gap.
  //
  //    The two sides are read at different instants (DB first, then chain), so
  //    a provide_liquidity landing in between is on chain but not yet in the
  //    DB tail, which looks exactly like divergence. Re-read the DB before
  //    paging: a gap that was merely in flight has closed by then, while a
  //    real one has not. Confirming costs one extra query on the rare mismatch
  //    path, and declining to confirm is strictly better than burning the
  //    30-min cooldown on a race — this alert says "manual investigation
  //    required".
  if (
    chainTotalShares !== null &&
    db.latestReconciledTotalShares !== null &&
    db.unreconciledShareRows === 0 &&
    chainTotalShares !== db.latestReconciledTotalShares &&
    await confirmDivergence(chainTotalShares)
  ) {
    if (shouldFire('chain_divergence', now)) {
      const text = [
        '*GoStop Bankroll — chain divergence*',
        '',
        `Chain total_shares: \`${chainTotalShares.toString()}\``,
        `DB latest reconciled: \`${db.latestReconciledTotalShares.toString()}\``,
        `Delta: \`${(chainTotalShares - db.latestReconciledTotalShares).toString()}\``,
        `Backlog: ${db.unreconciledShareRows} share-affecting / ${db.unreconciledRows} total`,
        '',
        'DB ≠ chain with no share-affecting row in flight to explain it. Possible missed event, cursor reset, or chain rollback. Manual investigation required.',
      ].join('\n');
      if (await sendTelegram(text)) {
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

/** Test-only — divergence confirmation, chain read injectable. */
export { confirmDivergence as _confirmDivergence };
