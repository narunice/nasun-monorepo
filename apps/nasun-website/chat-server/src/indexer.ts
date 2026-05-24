/**
 * Indexer (main-thread façade).
 *
 * The actual on-chain event polling runs in a worker thread (see
 * indexer-worker.ts). This module:
 *   1. Spawns the worker on startIndexer(cfg, largeTrade?).
 *   2. Receives raw spot-fill events from the worker and dispatches them
 *      to the narrator callbacks (largeTradeOpts.onLargeTrade and
 *      largeTradeOpts.onTradeFill) on main, where rooms.ts pool↔symbol
 *      state and market-narrator.ts price-tracker state live.
 *   3. Auto-respawns the worker 5s after an unexpected exit.
 *   4. Tears the worker down on stopIndexer().
 *
 * Background: prior to 2026-05-24 the indexer ran in-process and blocked
 * the main event loop ~1-3s every 5-10s. Moving it to a worker thread
 * decouples polling+SQLite writes+RPC roundtrips from HTTP/WebSocket
 * responsiveness. See handoff 2026-05-24-chat-server-indexer-worker.md.
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { LeaderboardConfig, TradeFillData } from './leaderboard-types.js';
import { getPoolSymbol, getPoolBaseDecimals } from './rooms.js';

export interface LargeTradeOptions {
  thresholdRaw: bigint;
  onLargeTrade: (message: string, poolId?: string) => void;
  onTradeFill?: (fill: TradeFillData) => void;
}

interface SpotFillEvent {
  type: 'spot-fill';
  poolId: string;
  priceRaw: string;
  baseQuantityRaw: string;
  quoteQuantityRaw: string;
  takerIsBid: boolean;
  timestampMs: number;
}

type WorkerInMsg = SpotFillEvent;

let worker: Worker | null = null;
let largeTradeOpts: LargeTradeOptions | null = null;
let stopping = false;

function handleSpotFill(msg: SpotFillEvent): void {
  if (!largeTradeOpts) return;

  // Large-trade dispatch: BigInt compare against caller's threshold, format
  // the human-readable string using main-thread rooms.ts state, then call
  // the narrator broadcast callback (which writes chat.db + emits WS).
  try {
    const quoteRaw = BigInt(msg.quoteQuantityRaw || '0');
    if (quoteRaw >= largeTradeOpts.thresholdRaw) {
      const quoteUsd = Number(quoteRaw / 1_000_000n) + Number(quoteRaw % 1_000_000n) / 1_000_000;
      const baseDec = getPoolBaseDecimals(msg.poolId);
      const baseQty = Number(msg.baseQuantityRaw) / Math.pow(10, baseDec);
      const side = msg.takerIsBid ? 'bought' : 'sold';
      const priceNum = Number(msg.priceRaw) / 1_000_000_000;
      const symbol = getPoolSymbol(msg.poolId) ?? 'tokens';
      const formatted = `Large trade: ${baseQty.toFixed(4)} ${symbol} ${side} at $${priceNum.toLocaleString('en-US', { maximumFractionDigits: 2 })} ($${quoteUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })})`;
      largeTradeOpts.onLargeTrade(formatted, msg.poolId);
    }
  } catch {
    // Never let narrator formatting errors break the IPC loop.
  }

  // Every-fill narrator hook: market-narrator.ts updatePool / rate limit /
  // canSendMessage / broadcastSystemMessage. Module-scoped price-tracker
  // state must stay on main (single source of truth).
  if (largeTradeOpts.onTradeFill) {
    try {
      const fillBaseDec = getPoolBaseDecimals(msg.poolId);
      largeTradeOpts.onTradeFill({
        poolId: msg.poolId,
        price: Number(msg.priceRaw) / 1e9,
        baseQuantity: Number(msg.baseQuantityRaw) / Math.pow(10, fillBaseDec),
        quoteQuantity: Number(msg.quoteQuantityRaw) / 1e6,
        takerIsBid: msg.takerIsBid,
        timestampMs: msg.timestampMs,
      });
    } catch {
      // Never let narrator state updates break the IPC loop.
    }
  }
}

function spawnWorker(cfg: LeaderboardConfig): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const workerPath = join(__dirname, 'indexer-worker.js');

  // Structured clone preserves Set (cfg.excludedAddresses) natively.
  worker = new Worker(workerPath, { workerData: cfg });

  worker.on('message', (msg: WorkerInMsg) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'spot-fill') handleSpotFill(msg);
  });

  worker.on('error', (err: Error) => {
    console.error('[Indexer/main] Worker error:', err.message);
  });

  worker.on('exit', (code: number) => {
    worker = null;
    if (stopping) return;
    console.warn(`[Indexer/main] Worker exited unexpectedly code=${code}; respawning in 5s`);
    setTimeout(() => {
      if (!stopping) spawnWorker(cfg);
    }, 5000);
  });

  console.log(`[Indexer/main] Worker spawned (poll interval ${cfg.indexerPollIntervalMs}ms)`);
}

export function startIndexer(cfg: LeaderboardConfig, largeTrade?: LargeTradeOptions): void {
  largeTradeOpts = largeTrade ?? null;
  stopping = false;
  spawnWorker(cfg);
}

export function stopIndexer(): void {
  stopping = true;
  if (worker) {
    try { worker.postMessage({ type: 'shutdown' }); } catch { /* ignore */ }
    worker.terminate().catch(() => { /* ignore */ });
    worker = null;
  }
  console.log('[Indexer/main] Stopped');
}
