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
 *      `total_shares_after` AND there are no outstanding unreconciled rows.
 *      Real divergence — not just a reconciler in flight — points to a
 *      missed event, an indexer cursor reset gone wrong, or a chain
 *      rollback. Always alert, no threshold.
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

interface DbDriftStats {
  unreconciledRows: number;
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
      oldest_age_ms: string;
      latest_total_shares: string | null;
    }[]
  >`
    WITH unreconciled AS (
      SELECT COUNT(*)::text AS cnt,
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
           unreconciled.oldest_age_ms,
           latest.total_shares AS latest_total_shares
    FROM unreconciled LEFT JOIN latest ON TRUE
  `;
  const row = rows[0];
  return {
    unreconciledRows: Number(row?.unreconciled_rows ?? '0'),
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

  // 3. Chain divergence — only meaningful when there's nothing left to
  //    reconcile. Otherwise the mismatch is just "reconciler in flight."
  if (
    chainTotalShares !== null &&
    db.latestReconciledTotalShares !== null &&
    db.unreconciledRows === 0 &&
    chainTotalShares !== db.latestReconciledTotalShares
  ) {
    if (shouldFire('chain_divergence', now)) {
      const text = [
        '*GoStop Bankroll — chain divergence*',
        '',
        `Chain total_shares: \`${chainTotalShares.toString()}\``,
        `DB latest reconciled: \`${db.latestReconciledTotalShares.toString()}\``,
        `Delta: \`${(chainTotalShares - db.latestReconciledTotalShares).toString()}\``,
        '',
        'Reconciler drained but DB ≠ chain. Possible missed event, cursor reset, or chain rollback. Manual investigation required.',
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
};
