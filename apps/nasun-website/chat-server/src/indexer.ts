import { SuiClient } from '@mysten/sui/client';
import type {
  LeaderboardConfig,
  OrderFilledParsedJson,
  OrderPlacedParsedJson,
  OrderCanceledParsedJson,
  TradeFillData,
  OrderEventType,
} from './leaderboard-types.js';
import {
  getIndexerState, setIndexerState,
  getBalanceManagerOwner, setBalanceManagerOwner,
  insertTradeFill,
  insertOrderEvent,
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

      // Small delay in catch-up mode to be polite to RPC
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (err) {
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

        if (hasMore) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (err) {
        console.error(`[Indexer] Poll ${source.label} error:`, (err as Error).message);
        hasMore = false;
      }
    }
  }

  return totalIndexed;
}

// ===== Lifecycle =====

function schedulePoll(): void {
  if (!running || !config) return;

  pollTimer = setTimeout(async () => {
    const fillCount = await pollOrderFilled();
    const orderCount = await pollOrderEvents();
    if (fillCount > 0 || orderCount > 0) {
      console.log(`[Indexer] Indexed ${fillCount} fills, ${orderCount} order events`);
      setIndexerState('last_indexed_at', String(Date.now()));
    }
    schedulePoll();
  }, config.indexerPollIntervalMs);
}

export function startIndexer(cfg: LeaderboardConfig, largeTrade?: LargeTradeOptions): void {
  config = cfg;
  client = new SuiClient({ url: cfg.rpcUrl });
  running = true;
  largeTradeOpts = largeTrade ?? null;

  console.log(`[Indexer] Starting (poll interval: ${cfg.indexerPollIntervalMs}ms, RPC: ${cfg.rpcUrl})`);
  console.log(`[Indexer] DeepBook package: ${cfg.deepbookPackage.slice(0, 16)}...`);

  // Initial poll immediately, then schedule
  Promise.all([pollOrderFilled(), pollOrderEvents()]).then(([fills, orders]) => {
    if (fills > 0 || orders > 0) {
      console.log(`[Indexer] Initial poll indexed ${fills} fills, ${orders} order events`);
      setIndexerState('last_indexed_at', String(Date.now()));
    }
    schedulePoll();
  });
}

export function stopIndexer(): void {
  running = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  console.log('[Indexer] Stopped');
}
