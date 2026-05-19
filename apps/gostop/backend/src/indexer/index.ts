/**
 * gostop-indexer entry point.
 *
 * Drives 12 event streams and one reconciler / matview refresh per tick.
 * Streams are ordered by their dependency in the lottery synthesis pipeline
 * (purchase -> draw -> settle -> claim -> sweep), but every stream is
 * idempotent so out-of-order arrivals (cursor lag, RPC retries) are
 * absorbed via the post-stream reconciler + matview refresh.
 *
 * Loop: poll every POLL_INTERVAL_MS. Each tick exhausts each stream's cursor
 * (≤ MAX_PAGES_PER_TICK pages) so a cold-started indexer catches up without
 * operator intervention.
 *
 * Spec: apps/gostop/docs/game-result-schema.md §6
 */

import type { StreamKey } from '../config/contracts.js';
import { env } from '../env.js';
import { closeAll, reader } from '../db/client.js';
import { readCursor } from '../db/cursor.js';
import {
  tickGameResult,
  tickBetRefunded,
  tickTreasuryDeposited,
  tickLiquidityProvided,
  tickWithdrawRequested,
  tickLiquidityRedeemed,
  tickPoolSharesSeeded,
  tickUtilizationCapUpdated,
} from './streams/bankroll-pool.js';
import {
  tickLotteryRoundCreated,
  tickLotteryTicketPurchased,
  tickLotteryNumbersDrawn,
  tickLotteryRoundSettled,
  tickLotteryPrizeClaimed,
  tickLotteryUnclaimedSwept,
  reconcileLottery,
} from './streams/lottery.js';
import {
  tickCrashRoundStarted,
  tickCrashCashOut,
  tickCrashRoundResolved,
  tickCrashRoundRefunded,
} from './streams/crash.js';
import { maybeRefreshMatviews } from './matview-refresh.js';
import { reconcileBankrollSnapshots } from './bankroll-reconciler.js';
import { startRiskAlertLoop } from './risk-alert.js';

const POLL_INTERVAL_MS = 1_000;

let running = true;
let inFlight = false;
let sleepHandle: NodeJS.Timeout | null = null;

interface StreamHandler {
  name: string;
  stream: StreamKey;
  run: () => Promise<number>;
}

// Ordered by lottery dependency chain + crash auxiliary tail. The reconciler
// runs after all streams so it sees the freshest state.
const HANDLERS: StreamHandler[] = [
  { name: 'GameResult',          stream: 'bankroll_pool::GameResult',         run: tickGameResult },
  { name: 'BetRefunded',         stream: 'bankroll_pool::BetRefunded',        run: tickBetRefunded },
  { name: 'TreasuryDeposited',   stream: 'bankroll_pool::TreasuryDeposited',  run: tickTreasuryDeposited },
  { name: 'LiquidityProvided',   stream: 'bankroll_pool::LiquidityProvided',  run: tickLiquidityProvided },
  { name: 'WithdrawRequested',   stream: 'bankroll_pool::WithdrawRequested',  run: tickWithdrawRequested },
  { name: 'LiquidityRedeemed',   stream: 'bankroll_pool::LiquidityRedeemed',  run: tickLiquidityRedeemed },
  { name: 'PoolSharesSeeded',    stream: 'bankroll_pool::PoolSharesSeeded',   run: tickPoolSharesSeeded },
  { name: 'UtilizationCapUpdated', stream: 'bankroll_pool::UtilizationCapUpdated', run: tickUtilizationCapUpdated },
  { name: 'LotteryRoundCreated', stream: 'lottery::RoundCreated',      run: tickLotteryRoundCreated },
  { name: 'LotteryTicket',       stream: 'lottery::TicketPurchased',   run: tickLotteryTicketPurchased },
  { name: 'LotteryNumbersDrawn', stream: 'lottery::NumbersDrawn',      run: tickLotteryNumbersDrawn },
  { name: 'LotteryRoundSettled', stream: 'lottery::RoundSettled',      run: tickLotteryRoundSettled },
  { name: 'LotteryPrizeClaimed', stream: 'lottery::PrizeClaimed',      run: tickLotteryPrizeClaimed },
  { name: 'LotteryUnclaimedSwept', stream: 'lottery::UnclaimedSwept',  run: tickLotteryUnclaimedSwept },
  { name: 'CrashRoundStarted',   stream: 'crash::RoundStarted',        run: tickCrashRoundStarted },
  { name: 'CrashCashOut',        stream: 'crash::CashOutRecorded',     run: tickCrashCashOut },
  { name: 'CrashRoundResolved',  stream: 'crash::RoundResolved',       run: tickCrashRoundResolved },
  { name: 'CrashRoundRefunded',  stream: 'crash::RoundRefunded',       run: tickCrashRoundRefunded },
];

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    for (const h of HANDLERS) {
      try {
        const n = await h.run();
        if (n > 0) console.log(`[indexer] ${h.name} processed=${n}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const c = await readCursor(h.stream).catch(() => null);
        const cursorStr = c
          ? `lastTx=${c.lastTx ?? '∅'} lastSeq=${c.lastSeq ?? '∅'}`
          : 'cursor=?';
        console.warn(`[indexer] ${h.name} tick failed (${cursorStr}): ${msg}`);
      }
    }

    // Order-independent backfill (lottery match/tier/expected_payout/status).
    try {
      const r = await reconcileLottery();
      if (r > 0) console.log(`[indexer] reconcileLottery touched=${r}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[indexer] reconcileLottery failed: ${msg}`);
    }

    // BankrollPool total_shares snapshot fill. Watermark-gated: only acts
    // once every PnL stream has reported (in-memory MIN). Bounded 1000 rows
    // per tick across 20 mini-transactions; statement_timeout safe.
    try {
      const r = await reconcileBankrollSnapshots();
      if (r > 0) console.log(`[indexer] reconcileBankrollSnapshots touched=${r}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[indexer] reconcileBankrollSnapshots failed: ${msg}`);
    }

    // Matview refresh. Cadence-aware; advisory-locked so deploy bounces
    // don't double-fire concurrent REFRESH CONCURRENTLY.
    try {
      await maybeRefreshMatviews();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[indexer] matview tick failed: ${msg}`);
    }
  } finally {
    inFlight = false;
  }
}

function abortableSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    sleepHandle = setTimeout(() => {
      sleepHandle = null;
      resolve();
    }, ms);
  });
}

function installShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    console.log(`[indexer] received ${signal}, draining`);
    running = false;
    if (sleepHandle) {
      clearTimeout(sleepHandle);
      sleepHandle = null;
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Boot-time guard for bankroll-reconciler's UPDATE columns. schema-audit
 * only scans INSERT column lists (db/schema-audit.test.ts:16 scope note),
 * so a column rename in a future migration would slip through and surface
 * as a runtime crash later. Fail fast at boot instead.
 */
async function assertReconcilerColumns(): Promise<void> {
  const sql = reader();
  // Probe with LIMIT 0 so the optimizer skips the table scan.
  await sql`SELECT total_shares_after FROM gostop.bankroll_event LIMIT 0`;
}

async function main(): Promise<void> {
  console.log('[indexer] boot', {
    rpc: env.rpc.url,
    poolMax: env.db.poolMax,
    streams: HANDLERS.map((h) => h.name),
    matviewIntervalMin: env.matview.intervalMin,
  });
  try {
    await assertReconcilerColumns();
  } catch (err) {
    console.error('[indexer] reconciler column probe failed — migration 004 may be missing', err);
    throw err;
  }
  installShutdownHandlers();

  // Tier 1.3 risk alerting. No-op when TELEGRAM_BOT_TOKEN / _CHAT_ID unset, so
  // ship-before-env-populated is safe. Operator flips env on node-3 to enable.
  startRiskAlertLoop();

  while (running) {
    await tick();
    if (!running) break;
    await abortableSleep(POLL_INTERVAL_MS);
  }

  console.log('[indexer] draining DB pools');
  await closeAll();
  console.log('[indexer] bye');
}

main().catch((err) => {
  console.error('[indexer] fatal', err);
  process.exit(1);
});
