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
import { closeAll } from '../db/client.js';
import { readCursor } from '../db/cursor.js';
import { tickGameResult, tickBetRefunded } from './streams/bankroll-pool.js';
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
  { name: 'GameResult',          stream: 'bankroll_pool::GameResult',  run: tickGameResult },
  { name: 'BetRefunded',         stream: 'bankroll_pool::BetRefunded', run: tickBetRefunded },
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

async function main(): Promise<void> {
  console.log('[indexer] boot', {
    rpc: env.rpc.url,
    poolMax: env.db.poolMax,
    streams: HANDLERS.map((h) => h.name),
    matviewIntervalMin: env.matview.intervalMin,
  });
  installShutdownHandlers();

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
