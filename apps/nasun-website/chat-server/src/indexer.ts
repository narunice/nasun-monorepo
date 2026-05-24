import { SuiClient } from '@mysten/sui/client';
import type {
  LeaderboardConfig,
  OrderFilledParsedJson,
  OrderPlacedParsedJson,
  OrderCanceledParsedJson,
  PredictionOrderFilledParsedJson,
  TradeFillData,
  OrderEventType,
} from './leaderboard-types.js';
import {
  getIndexerState, setIndexerState,
  getBalanceManagerOwner, setBalanceManagerOwner,
  insertTradeFill,
  insertOrderEvent,
  upsertPredictionMarket,
} from './leaderboard-store.js';
import { getPoolSymbol, getPoolBaseDecimals } from './rooms.js';

// In-memory cache for balance_manager_id -> owner address (LRU-bounded)
const BM_CACHE_MAX = 10_000;
const bmCache = new Map<string, string>();

function setBmCache(key: string, value: string): void {
  if (bmCache.size >= BM_CACHE_MAX) {
    // Evict oldest entry (Map preserves insertion order)
    const firstKey = bmCache.keys().next().value;
    if (firstKey) bmCache.delete(firstKey);
  }
  bmCache.set(key, value);
}

export interface LargeTradeOptions {
  thresholdRaw: bigint;
  onLargeTrade: (message: string, poolId?: string) => void;
  onTradeFill?: (fill: TradeFillData) => void;
}

let client: SuiClient | null = null;
let config: LeaderboardConfig | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let largeTradeOpts: LargeTradeOptions | null = null;

// Backoff state for RPC 5xx errors (503 Service Unavailable from overloaded Node-3)
let consecutiveRpcErrors = 0;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 120_000; // 2 min cap

function backoffDelayMs(): number {
  if (consecutiveRpcErrors === 0) return 0;
  const exp = Math.min(consecutiveRpcErrors - 1, 7); // cap at 2^7 = 128x base
  const base = Math.min(BACKOFF_BASE_MS * Math.pow(2, exp), BACKOFF_MAX_MS);
  const jitter = (Math.random() - 0.5) * 0.6 * base; // ±30% jitter to spread reconnect storms
  return Math.min(Math.max(0, base + jitter), BACKOFF_MAX_MS);
}

function isRpcError(err: unknown): boolean {
  const msg = (err as Error).message ?? '';
  return /\b(503|502)\b/.test(msg) || msg.includes('Service Unavailable');
}

// ===== Balance Manager Resolution =====

/**
 * Resolve a balance_manager_id to its owner address.
 * Checks: in-memory cache -> SQLite cache -> RPC getObject (fallback)
 */
async function resolveBalanceManager(bmId: string): Promise<string | null> {
  // 1. In-memory cache
  const cached = bmCache.get(bmId);
  if (cached) return cached;

  // 2. SQLite cache
  const dbCached = getBalanceManagerOwner(bmId);
  if (dbCached) {
    setBmCache(bmId, dbCached);
    return dbCached;
  }

  // 3. RPC fallback: read the BalanceManager object to get its owner
  if (!client) return null;

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

    // Shared or immutable object — try reading content for owner field
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

// ===== Event Polling =====

const CURSOR_KEY = 'order_filled_cursor';

async function pollOrderFilled(): Promise<number> {
  if (!client || !config) return 0;

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

        // Resolve balance manager IDs to addresses
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
          is_yes: null, // spot has no YES/NO side
          timestamp_ms: Number(json.timestamp) || Number(event.timestampMs) || Date.now(),
        });

        // Check for large trade broadcast
        if (largeTradeOpts) {
          try {
            const quoteRaw = BigInt(json.quote_quantity || '0');
            if (quoteRaw >= largeTradeOpts.thresholdRaw) {
              const quoteUsd = Number(quoteRaw / 1_000_000n) + Number(quoteRaw % 1_000_000n) / 1_000_000;
              const baseDec = getPoolBaseDecimals(json.pool_id);
              const baseQty = Number(json.base_quantity) / Math.pow(10, baseDec);
              const side = json.taker_is_bid ? 'bought' : 'sold';
              const priceNum = Number(json.price) / 1_000_000_000; // DeepBook V3 price uses 9 decimals
              const symbol = getPoolSymbol(json.pool_id) ?? 'tokens';
              const msg = `Large trade: ${baseQty.toFixed(4)} ${symbol} ${side} at $${priceNum.toLocaleString('en-US', { maximumFractionDigits: 2 })} ($${quoteUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })})`;
              largeTradeOpts.onLargeTrade(msg, json.pool_id);
            }
          } catch {
            // Ignore formatting errors in broadcast — never block indexing
          }
        }

        // Notify market narrator of every fill
        if (largeTradeOpts?.onTradeFill) {
          try {
            const fillBaseDec = getPoolBaseDecimals(json.pool_id);
            largeTradeOpts.onTradeFill({
              poolId: json.pool_id,
              price: Number(json.price) / 1e9, // DeepBook V3 price uses 9 decimals
              baseQuantity: Number(json.base_quantity) / Math.pow(10, fillBaseDec),
              quoteQuantity: Number(json.quote_quantity) / 1e6,
              takerIsBid: json.taker_is_bid,
              timestampMs: Number(json.timestamp) || Number(event.timestampMs) || Date.now(),
            });
          } catch {
            // Never block indexing for narrator failures
          }
        }

        totalIndexed++;
      }

      // Save cursor after processing this page
      if (result.nextCursor) {
        currentCursor = result.nextCursor;
        setIndexerState(CURSOR_KEY, JSON.stringify(currentCursor));
      }

      hasMore = result.hasNextPage;

      // Successful page — reset RPC error counter
      consecutiveRpcErrors = 0;

      // Small delay in catch-up mode to be polite to RPC
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (err) {
      if (isRpcError(err)) consecutiveRpcErrors++;
      console.error('[Indexer] Poll error:', (err as Error).message);
      hasMore = false; // Will retry on next poll cycle
    }
  }

  return totalIndexed;
}

// ===== OrderPlaced + OrderCanceled Event Polling =====

interface OrderEventSource {
  eventType: string;
  cursorKey: string;
  label: OrderEventType;
}

/**
 * Poll OrderPlaced and OrderCanceled events.
 * Uses a single interleaved cursor approach: poll both event types sequentially.
 */
async function pollOrderEvents(): Promise<number> {
  if (!client || !config) return 0;

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

          // For OrderPlaced, quantity field is placed_quantity; for OrderCanceled, base_quantity
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

        // Save cursor after processing this page
        if (result.nextCursor) {
          currentCursor = result.nextCursor;
          setIndexerState(source.cursorKey, JSON.stringify(currentCursor));
        }

        hasMore = result.hasNextPage;

        // Successful page — reset RPC error counter
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

// ===== Prediction Market OrderFilled Polling =====
//
// Pado prediction market is a custom CLOB (apps/pado/contracts-prediction).
// It emits its own `prediction_market::OrderFilled` with direct maker/taker
// addresses (no balance manager indirection) and `cost` in NUSDC raw (6 dec).
// We fold these into the same `trade_fills` table with pool_id prefixed
// `prediction:${market_id}` so aggregator/PnL can distinguish source without a
// schema change. `fill_shares` is shares (not comparable to spot base_quantity
// in absolute terms); aggregator's PnL filter uses the prefix to isolate.

const PREDICTION_CURSOR_KEY = 'prediction_order_filled_cursor';

async function pollPredictionOrderFilled(): Promise<number> {
  if (!client || !config) return 0;
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

        // Synthetic pool_id with `prediction:` prefix so aggregator can isolate
        // by pattern. `taker_is_bid` mirrors prediction's `is_bid` (taker side).
        // `base_quantity` carries fill_shares for completeness; PnL must skip
        // prediction pools because the share unit differs from spot tokens.
        // NOTE: prediction OrderFilled's `is_bid` is the MAKER's side
        // (prediction_market.move:202 comment). We stash it in the
        // `taker_is_bid` column for backward compatibility with the spot
        // schema. SQL readers that touch prediction rows must treat this
        // column as maker_is_bid; computeWeeklyPredictionPnl aliases it back.
        //
        // Lowercase maker/taker for canonical key matching: identity-resolver,
        // wash-pair set, and downstream banned-address checks all compare
        // against lowercase 0x-prefixed addresses. RPC parsedJson is generally
        // already lowercase, but we normalize defensively so a future SDK
        // change can't silently break per-user position accounting.
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

// ===== Prediction Market Resolution Polling =====
//
// MarketResolved/MarketCancelled feed prediction_markets, which
// computeWeeklyPredictionPnl joins against trade_fills to score prediction
// PnL. Pull-based settlement: resolver triggers MarketResolved; claim_winnings
// fires later per user. We score at resolve time regardless of claim status.

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
  if (!client || !config) return 0;
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
        // Move struct has no timestamp field; use checkpoint time (matches
        // trade_fills.timestamp_ms unit so the (resolved_at_ms, timestamp_ms)
        // comparison in computeWeeklyPredictionPnl is consistent).
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
  if (!client || !config) return 0;
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
        // Use event.timestampMs to match trade_fills timestamp clock.
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
  // Parallelize: each poller uses an independent cursor key so no shared state
  // races. Promise.allSettled keeps the indexer alive even if one source's RPC
  // hiccups (its error is logged inside the poller; we just continue).
  //
  // `consecutiveRpcErrors` is a module-scoped counter touched by every poller.
  // With 5 parallel pollers, a full RPC outage can bump it by up to 5 per
  // cycle and trigger the 120s backoff cap sooner. That is intentional: faster
  // backoff during a true outage reduces RPC pressure. Mixed cycles (any
  // success) reset the counter to 0, so partial errors don't compound.
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
}

function schedulePoll(): void {
  if (!running || !config) return;

  const backoff = backoffDelayMs();
  const delay = config.indexerPollIntervalMs + backoff;
  if (backoff > 0) {
    console.warn(`[Indexer] RPC errors=${consecutiveRpcErrors}, backing off ${Math.round(delay / 1000)}s`);
  }

  pollTimer = setTimeout(async () => {
    const r = await runAllPolls();
    if (r.fills > 0 || r.orders > 0 || r.predFills > 0 || r.resolved > 0 || r.cancelled > 0) {
      console.log(
        `[Indexer] Indexed ${r.fills} spot fills, ${r.orders} order events, ${r.predFills} prediction fills, ${r.resolved} resolved, ${r.cancelled} cancelled`,
      );
      setIndexerState('last_indexed_at', String(Date.now()));
    }
    schedulePoll();
  }, delay);
}

export function startIndexer(cfg: LeaderboardConfig, largeTrade?: LargeTradeOptions): void {
  config = cfg;
  client = new SuiClient({ url: cfg.rpcUrl });
  running = true;
  largeTradeOpts = largeTrade ?? null;

  console.log(`[Indexer] Starting (poll interval: ${cfg.indexerPollIntervalMs}ms, RPC: ${cfg.rpcUrl})`);
  console.log(`[Indexer] DeepBook package: ${cfg.deepbookPackage.slice(0, 16)}...`);
  if (cfg.predictionPackage) {
    console.log(`[Indexer] Prediction package: ${cfg.predictionPackage.slice(0, 16)}...`);
  } else {
    console.log('[Indexer] Prediction indexing disabled (PREDICTION_PACKAGE not set)');
  }

  // Initial poll immediately then schedule. consecutiveRpcErrors is best-effort
  // shared state across pollers; Promise.allSettled keeps it bounded since each
  // poller increments it at most once per cycle and resets on success.
  (async () => {
    const r = await runAllPolls();
    if (r.fills > 0 || r.orders > 0 || r.predFills > 0 || r.resolved > 0 || r.cancelled > 0) {
      console.log(
        `[Indexer] Initial poll indexed ${r.fills} spot fills, ${r.orders} order events, ${r.predFills} prediction fills, ${r.resolved} resolved, ${r.cancelled} cancelled`,
      );
      setIndexerState('last_indexed_at', String(Date.now()));
    }
    schedulePoll();
  })();
}

export function stopIndexer(): void {
  running = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  console.log('[Indexer] Stopped');
}
