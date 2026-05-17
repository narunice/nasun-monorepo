/**
 * gostop-indexer entry point.
 *
 * Tier 0 wiring: bankroll_pool::GameResult (5 games) + bankroll_pool::BetRefunded.
 * Follow-up commits add lottery::* (6 streams) and crash::* (4 streams) per
 * apps/gostop/docs/game-result-schema.md §6.
 *
 * Loop: poll every POLL_INTERVAL_MS. Each tick exhausts the cursor (up to
 * MAX_PAGES_PER_TICK pages per stream) so a cold-started indexer catches up
 * without operator intervention.
 */

import type { StreamKey } from '../config/contracts.js';
import { env } from '../env.js';
import { closeAll } from '../db/client.js';
import { readCursor } from '../db/cursor.js';
import { tickBetRefunded, tickGameResult } from './streams/bankroll-pool.js';

const POLL_INTERVAL_MS = 1_000;

let running = true;
let inFlight = false;

interface StreamHandler {
  name: string;
  stream: StreamKey;
  run: () => Promise<number>;
}

const HANDLERS: StreamHandler[] = [
  { name: 'GameResult',  stream: 'bankroll_pool::GameResult',  run: tickGameResult },
  { name: 'BetRefunded', stream: 'bankroll_pool::BetRefunded', run: tickBetRefunded },
];

async function tick(): Promise<void> {
  if (inFlight) return; // skip overlap; next interval will re-fire
  inFlight = true;
  try {
    for (const h of HANDLERS) {
      try {
        const n = await h.run();
        if (n > 0) console.log(`[indexer] ${h.name} inserted=${n}`);
      } catch (err) {
        // Don't crash the loop on per-stream errors. RPC outages flow through
        // rpc.ts retry, but if all retries exhaust we log and move on; cursor
        // is unchanged so the next tick resumes from the same point.
        const msg = err instanceof Error ? err.message : String(err);
        // Best-effort cursor lookup so the log line is a self-contained
        // forensic record for postmortem (5/8-style stalls).
        const c = await readCursor(h.stream).catch(() => null);
        const cursorStr = c
          ? `lastTx=${c.lastTx ?? '∅'} lastSeq=${c.lastSeq ?? '∅'}`
          : 'cursor=?';
        console.warn(`[indexer] ${h.name} tick failed (${cursorStr}): ${msg}`);
      }
    }
  } finally {
    inFlight = false;
  }
}

function installShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    console.log(`[indexer] received ${signal}, draining`);
    running = false;
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function main(): Promise<void> {
  console.log('[indexer] boot', {
    rpc: env.rpc.url,
    poolMax: env.db.poolMax,
    streams: HANDLERS.map((h) => h.name),
  });
  installShutdownHandlers();

  while (running) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log('[indexer] draining DB pools');
  await closeAll();
  console.log('[indexer] bye');
}

main().catch((err) => {
  console.error('[indexer] fatal', err);
  process.exit(1);
});
