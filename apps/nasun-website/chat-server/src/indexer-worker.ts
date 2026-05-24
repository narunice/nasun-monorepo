/**
 * Indexer Worker Thread.
 *
 * Runs the on-chain event polling loop (spot OrderFilled / OrderPlaced /
 * OrderCanceled + prediction OrderFilled / MarketResolved / MarketCancelled)
 * in a dedicated worker thread to keep the main HTTP/WebSocket event loop
 * responsive.
 *
 * Design (2026-05-24):
 *   - V8 isolation: this module has its own better-sqlite3 connection (via
 *     initLeaderboardStore), its own SuiClient, its own in-memory bmCache,
 *     its own RPC backoff counter. Cursor writes (indexer_state) and fill
 *     inserts go straight to leaderboard.db; the aggregator worker reads
 *     from the same DB via WAL + busy_timeout=30s (already provisioned for
 *     multi-writer access — see leaderboard-store.ts:25-46).
 *   - Worker emits raw fill data only. Threshold check, message formatting
 *     (which depends on rooms.ts module-scoped pool↔symbol mappings), and
 *     dispatch to narrator all stay on main. This avoids duplicating
 *     rooms.ts state into the worker, and keeps market-narrator.ts's
 *     module-scoped price-tracker state in one place. See handoff
 *     2026-05-24-chat-server-indexer-worker.md and Phase 1 review notes.
 *   - Shutdown: main posts {type:'shutdown'} → clear poll timer +
 *     closeLeaderboardStore + process.exit(0). The 5s respawn-on-exit in
 *     the façade only fires for unexpected exits (non-zero code), so a
 *     clean shutdown won't trigger a respawn race.
 *
 * Replaces the in-process indexer that previously blocked the main event
 * loop ~1-3s every 5-10s, causing user-visible HTTP stalls (prod measure
 * 2026-05-24: runAllPolls 932-2820ms × 7 in 72s uptime).
 */

import { parentPort, workerData } from 'node:worker_threads';
import { SuiClient } from '@mysten/sui/client';
import type {
  LeaderboardConfig,
  OrderFilledParsedJson,
  OrderPlacedParsedJson,
  OrderCanceledParsedJson,
  PredictionOrderFilledParsedJson,
  OrderEventType,
} from './leaderboard-types.js';
import {
  initLeaderboardStore,
  closeLeaderboardStore,
  getIndexerState, setIndexerState,
  getBalanceManagerOwner, setBalanceManagerOwner,
  insertTradeFill,
  insertOrderEvent,
  upsertPredictionMarket,
} from './leaderboard-store.js';
import { traceAsync } from './perf-trace.js';

if (!parentPort) {
  throw new Error('indexer-worker.ts must be loaded as a worker_thread');
}
if (!workerData) {
  throw new Error('indexer-worker.ts requires workerData (LeaderboardConfig)');
}

const config: LeaderboardConfig = workerData as LeaderboardConfig;

// In-memory cache for balance_manager_id -> owner address (LRU-bounded).
// Worker-local; the persistent SQLite cache (balance_managers table) is the
// cross-restart source of truth so a worker respawn doesn't re-hit RPC for
// every existing BM.
const BM_CACHE_MAX = 10_000;
const bmCache = new Map<string, string>();

function setBmCache(key: string, value: string): void {
  if (bmCache.size >= BM_CACHE_MAX) {
    const firstKey = bmCache.keys().next().value;
    if (firstKey) bmCache.delete(firstKey);
  }
  bmCache.set(key, value);
}

const client = new SuiClient({ url: config.rpcUrl });
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let running = true;

// Backoff state for RPC 5xx errors (503 from overloaded Node-3)
let consecutiveRpcErrors = 0;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 120_000;

function backoffDelayMs(): number {
  if (consecutiveRpcErrors === 0) return 0;
  const exp = Math.min(consecutiveRpcErrors - 1, 7);
  const base = Math.min(BACKOFF_BASE_MS * Math.pow(2, exp), BACKOFF_MAX_MS);
  const jitter = (Math.random() - 0.5) * 0.6 * base;
  return Math.min(Math.max(0, base + jitter), BACKOFF_MAX_MS);
}

function isRpcError(err: unknown): boolean {
  const msg = (err as Error).message ?? '';
  return /\b(503|502)\b/.test(msg) || msg.includes('Service Unavailable');
}

// ===== Worker -> Main messages =====
//
// Raw fill events only. Main thread owns threshold comparison, message
// formatting (uses rooms.ts pool symbol/decimals state), narrator dispatch
// (price-tracker rate limit / canSendMessage), broadcastSystemMessage
// (chat.db write + WebSocket emit). Worker stays free of UI/narrator state.

interface SpotFillEvent {
  type: 'spot-fill';
  poolId: string;
  priceRaw: string;        // raw price (DeepBook 9 decimals)
  baseQuantityRaw: string; // raw base quantity (token-specific decimals)
  quoteQuantityRaw: string; // raw quote (NUSDC 6 decimals)
  takerIsBid: boolean;
  timestampMs: number;
}

type WorkerOutMsg = SpotFillEvent;

function emit(msg: WorkerOutMsg): void {
  try {
    parentPort!.postMessage(msg);
  } catch {
    // parentPort can be down during shutdown; never let IPC break indexing
  }
}

// ===== Balance Manager Resolution =====

async function resolveBalanceManager(bmId: string): Promise<string | null> {
  const cached = bmCache.get(bmId);
  if (cached) return cached;

  const dbCached = getBalanceManagerOwner(bmId);
  if (dbCached) {
    setBmCache(bmId, dbCached);
    return dbCached;
  }

  try {
    const obj = await client.getObject({
      id: bmId,
      options: { showOwner: true },
    });

    if (obj.data?.owner && typeof obj.data.owner === 'object' && 'AddressOwner' in obj.data.owner) {
      const ownerAddress = obj.data.owner.AddressOwner;
      setBmCache(bmId, ownerAddress);
      setBalanceManagerOwner(bmId, ownerAddress);
      return ownerAddress;
    }

    const objWithContent = await client.getObject({
      id: bmId,
      options: { showContent: true },
    });

    if (objWithContent.data?.content?.dataType === 'moveObject') {
      const fields = objWithContent.data.content.fields as Record<string, unknown>;
      if (typeof fields.owner === 'string') {
        setBmCache(bmId, fields.owner);
        setBalanceManagerOwner(bmId, fields.owner);
        return fields.owner;
      }
    }
  } catch (err) {
    console.warn(`[Indexer] Failed to resolve BM ${bmId.slice(0, 12)}...:`, (err as Error).message);
  }

  return null;
}

// ===== Spot OrderFilled =====

const CURSOR_KEY = 'order_filled_cursor';

async function pollOrderFilled(): Promise<number> {
  const savedCursor = getIndexerState(CURSOR_KEY);
  let cursor = null;
  if (savedCursor) {
    try {
      cursor = JSON.parse(savedCursor);
    } catch {
      console.error('[Indexer] Corrupt cursor, resetting');
      setIndexerState(CURSOR_KEY, '');
    }
  }

  const eventType = `${config.deepbookPackage}::order_info::OrderFilled`;

  let totalIndexed = 0;
  let currentCursor = cursor;
  let hasMore = true;

  while (hasMore && running) {
    try {
      const result = await client.queryEvents({
        query: { MoveEventType: eventType },
        cursor: currentCursor,
        limit: 50,
        order: 'ascending',
      });

      if (result.data.length === 0) {
        hasMore = false;
        break;
      }

      for (const event of result.data) {
        const json = event.parsedJson as OrderFilledParsedJson | undefined;
        if (!json) continue;

        const makerBmId = json.maker_balance_manager_id;
        const takerBmId = json.taker_balance_manager_id;

        const [makerAddress, takerAddress] = await Promise.all([
          resolveBalanceManager(makerBmId),
          resolveBalanceManager(takerBmId),
        ]);

        if (!makerAddress || !takerAddress) {
          console.warn(
            `[Indexer] Skipping fill (unresolvable BM): maker=${makerBmId.slice(0, 12)}, taker=${takerBmId.slice(0, 12)}`
          );
          continue;
        }

        const eventSeq = event.id?.eventSeq ?? '0';
        const txDigest = event.id?.txDigest ?? '';
        const timestampMs = Number(json.timestamp) || Number(event.timestampMs) || Date.now();

        insertTradeFill({
          tx_digest: txDigest,
          event_seq: eventSeq,
          pool_id: json.pool_id,
          maker_address: makerAddress,
          taker_address: takerAddress,
          maker_order_id: json.maker_order_id || null,
          taker_order_id: json.taker_order_id || null,
          price: json.price,
          base_quantity: json.base_quantity,
          quote_quantity: json.quote_quantity,
          taker_is_bid: json.taker_is_bid ? 1 : 0,
          is_yes: null,
          timestamp_ms: timestampMs,
        });

        // Raw fill emit — main does threshold check + format + narrator dispatch.
        emit({
          type: 'spot-fill',
          poolId: json.pool_id,
          priceRaw: json.price,
          baseQuantityRaw: json.base_quantity,
          quoteQuantityRaw: json.quote_quantity,
          takerIsBid: json.taker_is_bid,
          timestampMs,
        });

        totalIndexed++;
      }

      if (result.nextCursor) {
        currentCursor = result.nextCursor;
        setIndexerState(CURSOR_KEY, JSON.stringify(currentCursor));
      }

      hasMore = result.hasNextPage;
      consecutiveRpcErrors = 0;

      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (err) {
      if (isRpcError(err)) consecutiveRpcErrors++;
      console.error('[Indexer] Poll error:', (err as Error).message);
      hasMore = false;
    }
  }

  return totalIndexed;
}

// ===== OrderPlaced + OrderCanceled =====

interface OrderEventSource {
  eventType: string;
  cursorKey: string;
  label: OrderEventType;
}

async function pollOrderEvents(): Promise<number> {
  const sources: OrderEventSource[] = [
    {
      eventType: `${config.deepbookPackage}::order_info::OrderPlaced`,
      cursorKey: 'order_placed_cursor',
      label: 'placed',
    },
    {
      eventType: `${config.deepbookPackage}::order::OrderCanceled`,
      cursorKey: 'order_canceled_cursor',
      label: 'canceled',
    },
  ];

  let totalIndexed = 0;

  for (const source of sources) {
    if (!running) break;

    const savedCursor = getIndexerState(source.cursorKey);
    let cursor = null;
    if (savedCursor) {
      try {
        cursor = JSON.parse(savedCursor);
      } catch {
        setIndexerState(source.cursorKey, '');
      }
    }

    let currentCursor = cursor;
    let hasMore = true;

    while (hasMore && running) {
      try {
        const result = await client.queryEvents({
          query: { MoveEventType: source.eventType },
          cursor: currentCursor,
          limit: 50,
          order: 'ascending',
        });

        if (result.data.length === 0) {
          hasMore = false;
          break;
        }

        for (const event of result.data) {
          const json = event.parsedJson as (OrderPlacedParsedJson | OrderCanceledParsedJson) | undefined;
          if (!json) continue;

          const bmId = json.balance_manager_id;
          const ownerAddress = await resolveBalanceManager(bmId);
          if (!ownerAddress) {
            console.warn(`[Indexer] Skipping ${source.label} event (unresolvable BM): ${bmId.slice(0, 12)}`);
            continue;
          }

          const eventSeq = event.id?.eventSeq ?? '0';
          const txDigest = event.id?.txDigest ?? '';

          const quantity = source.label === 'placed'
            ? (json as OrderPlacedParsedJson).placed_quantity || '0'
            : (json as OrderCanceledParsedJson).base_quantity || '0';

          insertOrderEvent({
            tx_digest: txDigest,
            event_seq: eventSeq,
            event_type: source.label,
            pool_id: json.pool_id,
            balance_manager_id: bmId,
            owner_address: ownerAddress,
            order_id: String(json.order_id),
            price: json.price,
            quantity,
            is_bid: json.is_bid ? 1 : 0,
            timestamp_ms: Number(event.timestampMs) || Date.now(),
          });

          totalIndexed++;
        }

        if (result.nextCursor) {
          currentCursor = result.nextCursor;
          setIndexerState(source.cursorKey, JSON.stringify(currentCursor));
        }

        hasMore = result.hasNextPage;
        consecutiveRpcErrors = 0;

        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (err) {
        if (isRpcError(err)) consecutiveRpcErrors++;
        console.error(`[Indexer] Poll ${source.label} error:`, (err as Error).message);
        hasMore = false;
      }
    }
  }

  return totalIndexed;
}

// ===== Prediction Market OrderFilled =====

const PREDICTION_CURSOR_KEY = 'prediction_order_filled_cursor';

async function pollPredictionOrderFilled(): Promise<number> {
  if (!config.predictionPackage) return 0;

  const savedCursor = getIndexerState(PREDICTION_CURSOR_KEY);
  let cursor = null;
  if (savedCursor) {
    try {
      cursor = JSON.parse(savedCursor);
    } catch {
      console.error('[Indexer:Prediction] Corrupt cursor, resetting');
      setIndexerState(PREDICTION_CURSOR_KEY, '');
    }
  }

  const eventType = `${config.predictionPackage}::prediction_market::OrderFilled`;

  let totalIndexed = 0;
  let currentCursor = cursor;
  let hasMore = true;

  while (hasMore && running) {
    try {
      const result = await client.queryEvents({
        query: { MoveEventType: eventType },
        cursor: currentCursor,
        limit: 50,
        order: 'ascending',
      });

      if (result.data.length === 0) {
        hasMore = false;
        break;
      }

      for (const event of result.data) {
        const json = event.parsedJson as PredictionOrderFilledParsedJson | undefined;
        if (!json) continue;

        const eventSeq = event.id?.eventSeq ?? '0';
        const txDigest = event.id?.txDigest ?? '';

        insertTradeFill({
          tx_digest: txDigest,
          event_seq: eventSeq,
          pool_id: `prediction:${json.market_id}`,
          maker_address: String(json.maker).toLowerCase(),
          taker_address: String(json.taker).toLowerCase(),
          maker_order_id: String(json.order_id || ''),
          taker_order_id: null,
          price: json.price,
          base_quantity: json.fill_shares,
          quote_quantity: json.cost,
          taker_is_bid: json.is_bid ? 1 : 0,
          is_yes: json.is_yes ? 1 : 0,
          timestamp_ms: Number(event.timestampMs) || Date.now(),
        });

        totalIndexed++;
      }

      if (result.nextCursor) {
        currentCursor = result.nextCursor;
        setIndexerState(PREDICTION_CURSOR_KEY, JSON.stringify(currentCursor));
      }

      hasMore = result.hasNextPage;
      consecutiveRpcErrors = 0;

      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (err) {
      if (isRpcError(err)) consecutiveRpcErrors++;
      console.error('[Indexer:Prediction] Poll error:', (err as Error).message);
      hasMore = false;
    }
  }

  return totalIndexed;
}

// ===== Prediction Market Resolution =====

const PREDICTION_RESOLVED_CURSOR_KEY = 'prediction_market_resolved_cursor';
const PREDICTION_CANCELLED_CURSOR_KEY = 'prediction_market_cancelled_cursor';

interface PredictionMarketResolvedJson {
  market_id: string;
  outcome: boolean;
  resolver: string;
}

interface PredictionMarketCancelledJson {
  market_id: string;
  timestamp?: string;
}

async function pollPredictionMarketResolved(): Promise<number> {
  if (!config.predictionPackage) return 0;

  const savedCursor = getIndexerState(PREDICTION_RESOLVED_CURSOR_KEY);
  let cursor = null;
  if (savedCursor) {
    try { cursor = JSON.parse(savedCursor); }
    catch { setIndexerState(PREDICTION_RESOLVED_CURSOR_KEY, ''); }
  }

  const eventType = `${config.predictionPackage}::prediction_market::MarketResolved`;

  let totalIndexed = 0;
  let currentCursor = cursor;
  let hasMore = true;

  while (hasMore && running) {
    try {
      const result = await client.queryEvents({
        query: { MoveEventType: eventType },
        cursor: currentCursor,
        limit: 50,
        order: 'ascending',
      });

      if (result.data.length === 0) { hasMore = false; break; }

      for (const event of result.data) {
        const json = event.parsedJson as PredictionMarketResolvedJson | undefined;
        if (!json) continue;
        upsertPredictionMarket({
          market_id: json.market_id,
          status: 'resolved',
          outcome: json.outcome ? 1 : 0,
          resolved_at_ms: Number(event.timestampMs) || Date.now(),
        });
        totalIndexed++;
      }

      if (result.nextCursor) {
        currentCursor = result.nextCursor;
        setIndexerState(PREDICTION_RESOLVED_CURSOR_KEY, JSON.stringify(currentCursor));
      }
      hasMore = result.hasNextPage;
      consecutiveRpcErrors = 0;
      if (hasMore) await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      if (isRpcError(err)) consecutiveRpcErrors++;
      console.error('[Indexer:PredictionResolved] Poll error:', (err as Error).message);
      hasMore = false;
    }
  }

  return totalIndexed;
}

async function pollPredictionMarketCancelled(): Promise<number> {
  if (!config.predictionPackage) return 0;

  const savedCursor = getIndexerState(PREDICTION_CANCELLED_CURSOR_KEY);
  let cursor = null;
  if (savedCursor) {
    try { cursor = JSON.parse(savedCursor); }
    catch { setIndexerState(PREDICTION_CANCELLED_CURSOR_KEY, ''); }
  }

  const eventType = `${config.predictionPackage}::prediction_market::MarketCancelled`;

  let totalIndexed = 0;
  let currentCursor = cursor;
  let hasMore = true;

  while (hasMore && running) {
    try {
      const result = await client.queryEvents({
        query: { MoveEventType: eventType },
        cursor: currentCursor,
        limit: 50,
        order: 'ascending',
      });

      if (result.data.length === 0) { hasMore = false; break; }

      for (const event of result.data) {
        const json = event.parsedJson as PredictionMarketCancelledJson | undefined;
        if (!json) continue;
        upsertPredictionMarket({
          market_id: json.market_id,
          status: 'cancelled',
          outcome: null,
          resolved_at_ms: Number(event.timestampMs) || Date.now(),
        });
        totalIndexed++;
      }

      if (result.nextCursor) {
        currentCursor = result.nextCursor;
        setIndexerState(PREDICTION_CANCELLED_CURSOR_KEY, JSON.stringify(currentCursor));
      }
      hasMore = result.hasNextPage;
      consecutiveRpcErrors = 0;
      if (hasMore) await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      if (isRpcError(err)) consecutiveRpcErrors++;
      console.error('[Indexer:PredictionCancelled] Poll error:', (err as Error).message);
      hasMore = false;
    }
  }

  return totalIndexed;
}

// ===== Lifecycle =====

async function runAllPolls(): Promise<{ fills: number; orders: number; predFills: number; resolved: number; cancelled: number }> {
  // Same parallelism + Promise.allSettled semantics as the prior main-thread
  // version. Trace wrapper still fires — console.warn forwards from worker
  // stdout to parent so [Trace] lines stay visible in pm2 logs.
  return traceAsync('indexer.runAllPolls', async () => {
    const results = await Promise.allSettled([
      pollOrderFilled(),
      pollOrderEvents(),
      pollPredictionOrderFilled(),
      pollPredictionMarketResolved(),
      pollPredictionMarketCancelled(),
    ]);
    const val = (i: number): number =>
      results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<number>).value : 0;
    return { fills: val(0), orders: val(1), predFills: val(2), resolved: val(3), cancelled: val(4) };
  }, { threshold: 300 });
}

function schedulePoll(): void {
  if (!running) return;

  const backoff = backoffDelayMs();
  const delay = config.indexerPollIntervalMs + backoff;
  if (backoff > 0) {
    console.warn(`[Indexer] RPC errors=${consecutiveRpcErrors}, backing off ${Math.round(delay / 1000)}s`);
  }

  pollTimer = setTimeout(async () => {
    try {
      const r = await runAllPolls();
      if (r.fills > 0 || r.orders > 0 || r.predFills > 0 || r.resolved > 0 || r.cancelled > 0) {
        console.log(
          `[Indexer] Indexed ${r.fills} spot fills, ${r.orders} order events, ${r.predFills} prediction fills, ${r.resolved} resolved, ${r.cancelled} cancelled`,
        );
        setIndexerState('last_indexed_at', String(Date.now()));
      }
    } catch (err) {
      console.error('[Indexer/worker] runAllPolls error:', (err as Error).message);
    }
    schedulePoll();
  }, delay);
}

// ===== Worker bootstrap =====

initLeaderboardStore(config);
console.log(`[Indexer/worker] Started (poll interval: ${config.indexerPollIntervalMs}ms, RPC: ${config.rpcUrl})`);
console.log(`[Indexer/worker] DeepBook package: ${config.deepbookPackage.slice(0, 16)}...`);
if (config.predictionPackage) {
  console.log(`[Indexer/worker] Prediction package: ${config.predictionPackage.slice(0, 16)}...`);
} else {
  console.log('[Indexer/worker] Prediction indexing disabled (PREDICTION_PACKAGE not set)');
}

(async () => {
  try {
    const r = await runAllPolls();
    if (r.fills > 0 || r.orders > 0 || r.predFills > 0 || r.resolved > 0 || r.cancelled > 0) {
      console.log(
        `[Indexer] Initial poll indexed ${r.fills} spot fills, ${r.orders} order events, ${r.predFills} prediction fills, ${r.resolved} resolved, ${r.cancelled} cancelled`,
      );
      setIndexerState('last_indexed_at', String(Date.now()));
    }
  } catch (err) {
    console.error('[Indexer/worker] Initial poll error:', (err as Error).message);
  }
  schedulePoll();
})();

parentPort.on('message', (msg: { type?: string }) => {
  if (!msg || typeof msg.type !== 'string') return;
  if (msg.type === 'shutdown') {
    running = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    try { closeLeaderboardStore(); } catch { /* ignore */ }
    console.log('[Indexer/worker] Shutdown complete');
    process.exit(0);
  }
});
