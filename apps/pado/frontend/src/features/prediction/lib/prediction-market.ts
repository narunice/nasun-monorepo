/**
 * Prediction Market On-chain Utilities (round-6 plan §2.2, §2.7)
 *
 * Reads the v1 CLOB market struct + orderbook tables. Each FIFO entry
 * carries direction (isYes/isBid), locked NUSDC, and cost basis so
 * cancellation/refund flows have full information without table scans.
 *
 * 2026-05-20 v5 cutover: discovery accepts markets from either originalId
 * (legacy v1~v4 OR v5). Every fetched market is registered in the
 * marketPackageRegistry so downstream transaction builders dispatch to the
 * right `packageId` without thread-through plumbing.
 */

import type { EventId } from '@mysten/sui/client';
import { getSuiClient } from '../../../lib/sui-client';
import {
  MARKET_CREATED_EVENTS,
  ORDER_FILLED_EVENTS,
  TEST_MARKETS,
  PREDICTION_PACKAGE_ID,
  PREDICTION_ORIGINAL_PACKAGE_ID,
  LEGACY_PREDICTION_PACKAGE_ID,
  LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID,
  PREDICTION_LEGACY,
  registerMarketPackage,
} from '../constants';
import type { Order, OrderbookLevel, PredictionMarket, RecentFill } from '../types';
import { parseMarketStatus } from '../types';

const MAX_MARKETS_DISCOVERY = 1000;
const MAX_PRICE_LEVELS_PER_SIDE = 200;
const FETCH_CHUNK_SIZE = 50;

export async function fetchMarkets(): Promise<PredictionMarket[]> {
  let marketIds: string[] = TEST_MARKETS;
  if (marketIds.length === 0) {
    marketIds = await fetchMarketsByEvents();
  }

  const markets = await Promise.all(
    marketIds.map(async (marketId) => {
      try {
        return await fetchMarket(marketId);
      } catch (error) {
        console.error(`Failed to fetch market ${marketId}:`, error);
        return null;
      }
    }),
  );

  return markets.filter((m): m is PredictionMarket => m !== null);
}

export async function fetchMarket(marketId: string): Promise<PredictionMarket | null> {
  const client = getSuiClient();

  try {
    const object = await client.getObject({
      id: marketId,
      options: { showContent: true, showType: true },
    });

    if (!object.data?.content || object.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = object.data.content.fields as Record<string, unknown>;
    const objectType = object.data.type ?? '';
    return parseMarketFields(marketId, fields, objectType);
  } catch (error) {
    console.error(`Failed to fetch market ${marketId}:`, error);
    return null;
  }
}

function resolvePackageFromType(objectType: string): {
  packageId: string;
  originalPackageId: string;
  isLegacy: boolean;
} {
  // objectType looks like `<originalId>::prediction_market::Market`. Compare
  // the originalId prefix to determine which package universe this market
  // belongs to. Default to v5 when nothing matches (e.g. test envs).
  if (
    PREDICTION_LEGACY &&
    objectType.startsWith(`${LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID}::`)
  ) {
    return {
      packageId: LEGACY_PREDICTION_PACKAGE_ID,
      originalPackageId: LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID,
      isLegacy: true,
    };
  }
  return {
    packageId: PREDICTION_PACKAGE_ID,
    originalPackageId: PREDICTION_ORIGINAL_PACKAGE_ID,
    isLegacy: false,
  };
}

function parseMarketFields(
  id: string,
  fields: Record<string, unknown>,
  objectType: string,
): PredictionMarket {
  const { packageId, originalPackageId, isLegacy } = resolvePackageFromType(objectType);
  // Register the dispatch ASAP so concurrent transaction builders that look
  // up this marketId before the React Query cache settles will route correctly.
  registerMarketPackage(id, packageId);
  return {
    id,
    question: String(fields.question ?? ''),
    description: String(fields.description ?? ''),
    category: String(fields.category ?? ''),
    resolutionSource: String(fields.resolution_source ?? ''),
    resolutionCriteria: String(fields.resolution_criteria ?? ''),
    createdAt: Number(fields.created_at ?? 0),
    closeTime: Number(fields.close_time ?? 0),
    resolveDeadline: Number(fields.resolve_deadline ?? 0),
    yesSupply: BigInt(String(fields.yes_supply ?? '0')),
    noSupply: BigInt(String(fields.no_supply ?? '0')),
    collateralBalance: parseBalanceField(fields.collateral_pool ?? fields.collateral),
    totalVolume: BigInt(String(fields.total_volume ?? '0')),
    status: parseMarketStatus(Number(fields.status ?? 0)),
    outcome: parseOutcomeField(fields.outcome),
    creator: String(fields.creator ?? ''),
    resolver: String(fields.resolver ?? ''),
    // The Market struct stores yes_*_prices / no_*_prices as sorted vectors
    // (asks ascending, bids descending) so the head of each vector is the best
    // level. Reading them here is free — they ride along with the showContent
    // payload `fetchMarket` already requested.
    bestPrices: {
      yesBid: extractBestPrice(fields.yes_bid_prices),
      yesAsk: extractBestPrice(fields.yes_ask_prices),
      noBid: extractBestPrice(fields.no_bid_prices),
      noAsk: extractBestPrice(fields.no_ask_prices),
    },
    packageId,
    originalPackageId,
    isLegacy,
  };
}

function extractBestPrice(field: unknown): number | null {
  if (!Array.isArray(field) || field.length === 0) return null;
  const head = field[0];
  if (head === null || head === undefined) return null;
  const n = Number(head);
  return Number.isFinite(n) ? n : null;
}

function parseBalanceField(field: unknown): bigint {
  if (!field || typeof field !== 'object') return 0n;
  const balanceObj = field as Record<string, unknown>;
  return BigInt(String(balanceObj.value ?? '0'));
}

function parseOutcomeField(field: unknown): boolean | undefined {
  if (field === undefined || field === null) return undefined;
  // Some SDK / RPC paths normalize Sui's Option<bool> Some(x) down to the raw
  // boolean. The previous parser only handled the `{ vec: [...] }` shape and
  // returned undefined for raw booleans, which made every resolved market
  // appear to have no outcome — UI then always rendered "NO Won" and the
  // winning-side claim button never appeared.
  if (typeof field === 'boolean') return field;
  if (typeof field === 'object') {
    const optionObj = field as Record<string, unknown>;
    if (Array.isArray(optionObj.vec) && optionObj.vec.length > 0) {
      return Boolean(optionObj.vec[0]);
    }
  }
  return undefined;
}

/**
 * Fetch one side of the orderbook (bids OR asks for one outcome).
 * Capped at MAX_PRICE_LEVELS_PER_SIDE; chunks dynamic-field reads in
 * batches of FETCH_CHUNK_SIZE for parallelism (round-6 plan §2.7).
 */
export async function fetchMarketOrderbook(
  marketId: string,
  isYes: boolean,
): Promise<{ bids: OrderbookLevel[]; asks: OrderbookLevel[] }> {
  const client = getSuiClient();

  try {
    const marketObj = await client.getObject({ id: marketId, options: { showContent: true } });
    if (!marketObj.data?.content || marketObj.data.content.dataType !== 'moveObject') {
      return { bids: [], asks: [] };
    }

    const fields = marketObj.data.content.fields as Record<string, unknown>;
    const asksTableId = extractTableId(fields[isYes ? 'yes_asks' : 'no_asks']);
    const bidsTableId = extractTableId(fields[isYes ? 'yes_bids' : 'no_bids']);

    const [asks, bids] = await Promise.all([
      asksTableId ? fetchSide(asksTableId, false) : Promise.resolve<OrderbookLevel[]>([]),
      bidsTableId ? fetchSide(bidsTableId, true) : Promise.resolve<OrderbookLevel[]>([]),
    ]);

    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);
    return { bids, asks };
  } catch (error) {
    console.error('Failed to fetch orderbook:', error);
    return { bids: [], asks: [] };
  }
}

function extractTableId(field: unknown): string | undefined {
  const obj = field as { fields?: { id?: { id?: string } } } | undefined;
  return obj?.fields?.id?.id;
}

async function fetchSide(tableId: string, isBid: boolean): Promise<OrderbookLevel[]> {
  const client = getSuiClient();

  // Cursor walk over dynamic fields with a hard cap.
  const dynamicFieldNames: Array<{ name: { type: string; value: unknown } }> = [];
  let cursor: string | null | undefined = null;
  while (dynamicFieldNames.length < MAX_PRICE_LEVELS_PER_SIDE) {
    const page = await client.getDynamicFields({ parentId: tableId, cursor, limit: FETCH_CHUNK_SIZE });
    dynamicFieldNames.push(...page.data.map((d) => ({ name: d.name })));
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  const truncated = dynamicFieldNames.slice(0, MAX_PRICE_LEVELS_PER_SIDE);

  // Chunked parallel reads.
  const levels: OrderbookLevel[] = [];
  for (let i = 0; i < truncated.length; i += FETCH_CHUNK_SIZE) {
    const chunk = truncated.slice(i, i + FETCH_CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async (entry) => {
        const fieldObj = await client.getDynamicFieldObject({ parentId: tableId, name: entry.name });
        return parseLevel(fieldObj, entry.name.value, isBid);
      }),
    );
    for (const r of results) {
      if (r) levels.push(r);
    }
  }
  return levels;
}

function parseLevel(
  fieldObj: Awaited<ReturnType<ReturnType<typeof getSuiClient>['getDynamicFieldObject']>>,
  priceValue: unknown,
  isBid: boolean,
): OrderbookLevel | null {
  if (!fieldObj.data?.content || fieldObj.data.content.dataType !== 'moveObject') {
    return null;
  }
  const value = fieldObj.data.content.fields as Record<string, unknown>;
  const price = Number(priceValue);
  const orders = value.value as Array<Record<string, unknown>> | undefined;
  if (!orders || orders.length === 0) return null;

  // Sui SDK wraps Move struct fields inside an inner `fields` object when the
  // struct is nested (here: vector<Order> inside a Table value). Unwrap so
  // the read is robust to either shape — flat top-level or nested fields.
  const parsedOrders: Order[] = orders.map((raw) => {
    const f = ((raw as { fields?: Record<string, unknown> }).fields ?? raw);
    return {
      orderId: Number(f.order_id ?? 0),
      owner: String(f.owner ?? ''),
      isYes: Boolean(f.is_yes ?? false),
      isBid,
      price,
      amount: BigInt(String(f.amount ?? 0)),
      lockedNusdc: BigInt(String(f.locked_nusdc ?? 0)),
      costBasis: BigInt(String(f.cost_basis ?? 0)),
      timestamp: Number(f.timestamp ?? 0),
    };
  });

  const totalAmount = parsedOrders.reduce((sum, o) => sum + o.amount, 0n);
  return { price, amount: totalAmount, orders: parsedOrders, isSimulated: false };
}

export async function fetchMarketsWithOrderbooks(): Promise<
  {
    market: PredictionMarket;
    yesOrderbook: { bids: OrderbookLevel[]; asks: OrderbookLevel[] } | null;
    noOrderbook: { bids: OrderbookLevel[]; asks: OrderbookLevel[] } | null;
  }[]
> {
  // Lazy orderbook: previously this paralleled `fetchMarketOrderbook(yes)` +
  // `fetchMarketOrderbook(no)` for every discovered market, which on a 10-
  // market list meant ~40 sequential dynamic-field walks just to render the
  // /predict landing page (the core reason it loaded much slower than /spot).
  // List cards now read `lastTradePrice` from the shared market-fills cache;
  // full orderbooks are fetched only when the user opens a market detail.
  const markets = await fetchMarkets();
  return markets.map((market) => ({ market, yesOrderbook: null, noOrderbook: null }));
}

/**
 * Discover markets via MarketCreated events.
 *
 * 2026-05-20 v5 cutover: walks BOTH originalIds in parallel so v1~v4 in-
 * flight markets remain discoverable alongside any v5 markets. Cap is
 * applied per-side and re-applied to the merged result.
 */
export async function fetchMarketsByEvents(): Promise<string[]> {
  const client = getSuiClient();

  async function walkOne(eventType: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: EventId | null | undefined = null;
    while (ids.length < MAX_MARKETS_DISCOVERY) {
      const page = await client.queryEvents({
        query: { MoveEventType: eventType },
        cursor: cursor ?? null,
        limit: 50,
        order: 'descending',
      });
      for (const event of page.data) {
        const parsed = event.parsedJson as { market_id?: string } | undefined;
        if (parsed?.market_id) ids.push(parsed.market_id);
      }
      if (!page.hasNextPage || !page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return ids;
  }

  try {
    const perEventResults = await Promise.all(MARKET_CREATED_EVENTS.map(walkOne));
    // Dedupe preserving first-seen ordering (descending = newest first).
    const seen = new Set<string>();
    const merged: string[] = [];
    // Interleave: take from each event stream in turn so v5 newest beats
    // legacy newest by recency rather than by event-type ordering.
    const maxLen = Math.max(...perEventResults.map((r) => r.length), 0);
    for (let i = 0; i < maxLen && merged.length < MAX_MARKETS_DISCOVERY; i++) {
      for (const arr of perEventResults) {
        if (i < arr.length) {
          const id = arr[i];
          if (!seen.has(id)) {
            seen.add(id);
            merged.push(id);
            if (merged.length >= MAX_MARKETS_DISCOVERY) break;
          }
        }
      }
    }
    return merged;
  } catch (error) {
    console.error('Failed to fetch market events:', error);
    return TEST_MARKETS;
  }
}

/**
 * Fetch the most recent fills for a market in descending order.
 * Used as the seed for cursor-based polling.
 *
 * 2026-05-20 v5 cutover: walks both v5 and legacy OrderFilled event streams
 * so initial seed includes legacy fills. Pagination cursors are kept
 * per-stream; callers that subscribe to live updates rely on
 * `PredictionEventService` which has its own dual-cursor poller.
 */
export async function fetchRecentFillsInitial(
  marketId: string,
  limit = 50,
): Promise<{ fills: RecentFill[]; oldestEventId: EventId | null }> {
  const client = getSuiClient();
  const perEvent = await Promise.all(
    ORDER_FILLED_EVENTS.map((eventType) =>
      client.queryEvents({
        query: { MoveEventType: eventType },
        limit,
        order: 'descending',
      }),
    ),
  );

  const fills: RecentFill[] = [];
  let oldestEventId: EventId | null = null;
  for (const page of perEvent) {
    for (const event of page.data) {
      const parsed = parseFillEvent(event.parsedJson, Number(event.timestampMs ?? 0));
      if (parsed && parsed.marketId === marketId) {
        fills.push(parsed);
      }
      oldestEventId = event.id;
    }
  }
  // Sort merged feed by timestamp descending so seed matches expected ordering.
  fills.sort((a, b) => b.timestamp - a.timestamp);
  return { fills, oldestEventId };
}

function parseFillEvent(parsedJson: unknown, timestampMs: number): RecentFill | null {
  if (!parsedJson || typeof parsedJson !== 'object') return null;
  const j = parsedJson as Record<string, unknown>;
  if (!j.market_id) return null;
  return {
    marketId: String(j.market_id),
    orderId: Number(j.order_id ?? 0),
    taker: String(j.taker ?? ''),
    maker: String(j.maker ?? ''),
    isYes: Boolean(j.is_yes ?? false),
    isBid: Boolean(j.is_bid ?? false),
    price: Number(j.price ?? 0),
    fillShares: BigInt(String(j.fill_shares ?? 0)),
    cost: BigInt(String(j.cost ?? 0)),
    timestamp: timestampMs,
  };
}
