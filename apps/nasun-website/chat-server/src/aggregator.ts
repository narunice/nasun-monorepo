/**
 * Aggregator (main-thread façade).
 *
 * The actual aggregation cycle runs in a worker thread (see aggregator-worker.ts).
 * This module:
 *   1. Spawns the worker on startAggregator(cfg).
 *   2. Maintains the main-thread identity/banned caches so leaderboard-api hot reads
 *      (which run on the main thread) stay fresh independent of the worker's cycle.
 *   3. Forwards refresh signals (POST /banned-cache/refresh, identity invalidation)
 *      to the worker so its caches stay in sync without waiting for the TTL tick.
 *   4. Tears the worker down on stopAggregator().
 *
 * Background: prior to 2026-05-14 the aggregator ran in-process and blocked the main
 * event loop ~22.7s every 60s, causing CF 5xx bursts. Moving it to a worker thread
 * decouples the cycle from HTTP/WebSocket responsiveness. See project memory
 * `project_2026_05_13_chat_aggregator_blocking.md`.
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { LeaderboardConfig } from './leaderboard-types.js';
import { refreshIdentityCache, buildSameIdentityPairs } from './identity-resolver.js';
import { refreshBannedCache, backgroundRefreshBannedCache } from './banned-loader.js';

const IDENTITY_CACHE_REFRESH_MS = 60 * 60 * 1000;
const BANNED_CACHE_REFRESH_MS = 5 * 60 * 1000;

let worker: Worker | null = null;
let identityTimer: ReturnType<typeof setInterval> | null = null;
let bannedTimer: ReturnType<typeof setInterval> | null = null;
let stopping = false;

export function startAggregator(cfg: LeaderboardConfig): void {
  // Main-thread caches: leaderboard-api reads getBannedSnapshotSync()/getIdentityMap()
  // on hot HTTP paths. These intervals keep main's copies fresh; the worker has its
  // own independent copies refreshed on the same cadence.
  refreshIdentityCache()
    .then(async () => {
      const pairs = await buildSameIdentityPairs();
      console.log(`[Aggregator/main] Identity cache primed (${pairs.size} pairs)`);
    })
    .catch((err: Error) => {
      console.error('[Aggregator/main] Identity cache load failed:', err.message);
    });
  refreshBannedCache().catch(() => { /* logged inside */ });

  identityTimer = setInterval(() => {
    refreshIdentityCache().catch(() => { /* logged inside */ });
  }, IDENTITY_CACHE_REFRESH_MS);
  bannedTimer = setInterval(() => {
    backgroundRefreshBannedCache();
  }, BANNED_CACHE_REFRESH_MS);

  spawnWorker(cfg);
}

function spawnWorker(cfg: LeaderboardConfig): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const workerPath = join(__dirname, 'aggregator-worker.js');

  // Structured clone preserves Set/Map natively, so cfg.excludedAddresses survives intact.
  worker = new Worker(workerPath, { workerData: cfg });

  worker.on('error', (err: Error) => {
    console.error('[Aggregator/main] Worker error:', err.message);
  });
  worker.on('exit', (code: number) => {
    worker = null;
    if (stopping) return;
    console.warn(`[Aggregator/main] Worker exited unexpectedly code=${code}; respawning in 5s`);
    setTimeout(() => {
      if (!stopping) spawnWorker(cfg);
    }, 5000);
  });

  console.log(`[Aggregator/main] Worker spawned (interval ${cfg.aggregationIntervalMs}ms)`);
}

export function stopAggregator(): void {
  stopping = true;
  if (identityTimer) { clearInterval(identityTimer); identityTimer = null; }
  if (bannedTimer) { clearInterval(bannedTimer); bannedTimer = null; }
  if (worker) {
    try { worker.postMessage({ type: 'shutdown' }); } catch { /* ignore */ }
    worker.terminate().catch(() => { /* ignore */ });
    worker = null;
  }
  console.log('[Aggregator/main] Stopped');
}

/**
 * Forward an on-demand banned-cache refresh to the worker (called by the
 * POST /api/pado/internal/banned-cache/refresh endpoint after an admin
 * runs ban-users CLI so the worker doesn't have to wait the 5-min TTL).
 *
 * Main's own cache is refreshed inline by the caller via refreshBannedCache();
 * this helper handles the worker side.
 */
export function notifyWorkerBannedRefresh(): void {
  if (worker) {
    try { worker.postMessage({ type: 'refresh-banned' }); } catch { /* worker may be down */ }
  }
}

/**
 * Forward an identity-cache invalidation to the worker. Pair with main-thread
 * invalidateIdentityCache() when a wallet registration happens so both threads
 * see the new mapping on their next read.
 */
export function notifyWorkerIdentityInvalidate(): void {
  if (worker) {
    try { worker.postMessage({ type: 'invalidate-identity' }); } catch { /* worker may be down */ }
  }
}
