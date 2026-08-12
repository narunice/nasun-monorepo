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

import type { EventId, SuiObjectResponse } from '@mysten/sui/client';
import { getSuiClient } from '../../../lib/sui-client';
import { NETWORK_CONFIG } from '../../../config/network';
import {
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

// Sui RPC caps multiGetObjects at 50 ids per call.
const MARKET_FETCH_CHUNK = 50;

export async function fetchMarkets(): Promise<PredictionMarket[]> {
  let marketIds: string[] = TEST_MARKETS;
  if (marketIds.length === 0) {
    marketIds = await fetchMarketsByEvents();
  }
  if (marketIds.length === 0) return [];

  const client = getSuiClient();
  // A single /predict load can discover 150+ markets. Reading them with one
  // getObject each stampedes the fullnode (a concurrent burst → intermittent
  // failures → empty list, requiring a hard refresh). Batch into
  // multiGetObjects (50 ids/call) so 159 markets cost ~4 RPC calls instead of
  // 159 — the same anti-stampede pattern oracle-client and useMyOpenOrders use.
  const markets: PredictionMarket[] = [];
  for (let i = 0; i < marketIds.length; i += MARKET_FETCH_CHUNK) {
    const chunk = marketIds.slice(i, i + MARKET_FETCH_CHUNK);
    let objects: SuiObjectResponse[];
    try {
      objects = await client.multiGetObjects({
        ids: chunk,
        options: { showContent: true, showType: true },
      });
    } catch (error) {
      console.error('Failed to batch-fetch prediction markets:', error);
      continue;
    }
    for (let j = 0; j < chunk.length; j++) {
      const market = parseMarketObject(chunk[j], objects[j]);
      if (market) markets.push(market);
    }
  }
  return markets;
}

function parseMarketObject(
  marketId: string,
  object: SuiObjectResponse | undefined,
): PredictionMarket | null {
  if (!object?.data?.content || object.data.content.dataType !== 'moveObject') {
    return null;
  }
  const fields = object.data.content.fields as Record<string, unknown>;
  const objectType = object.data.type ?? '';
  return parseMarketFields(marketId, fields, objectType);
}

export async function fetchMarket(marketId: string): Promise<PredictionMarket | null> {
  const client = getSuiClient();
  try {
    const object = await client.getObject({
      id: marketId,
      options: { showContent: true, showType: true },
    });
    return parseMarketObject(marketId, object);
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
 * Discover markets via `create_market` transactions (NOT MarketCreated events).
 *
 * The devnet fullnode prunes transaction events after ~2 epochs (~4h), so
 * queryEvents(MarketCreated) throws "Could not find the referenced transaction
 * events" once markets age out. Because TEST_MARKETS is empty, that blanked the
 * entire market list (the whole prediction page went dark). queryTransactionBlocks
 * degrades gracefully — pruned txs come back with empty effects instead of
 * throwing — and the created shared Market object is right there in each create
 * tx's effects. Tx-index retention is short too, so only recently-created
 * markets survive on-chain; older markets need a durable indexer or longer
 * fullnode retention (follow-up).
 *
 * 2026-05-20 v5 cutover: queries each originalId's create_market so v1~v4 and v5
 * markets are both discoverable (deduped; on v8 the two ids coincide).
 */
/**
 * Durable market list from the indexer (explorer-api), which reads the current
 * object set instead of transaction history. Preferred over the create_market
 * scan below because the fullnode prunes that history: on 2026-08-09 every
 * market aged out of the tx index at once and the page went blank while 50
 * markets were still live on chain.
 */
async function fetchMarketIdsFromIndexer(): Promise<string[]> {
  // Bounded: without it a hung origin holds the page on the loading state for
  // as long as nginx's proxy_read_timeout allows, and the tx-scan fallback
  // below never gets a turn.
  const res = await fetch(`${NETWORK_CONFIG.explorerApiUrl}/prediction/markets`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`market list HTTP ${res.status}`);
  const data = (await res.json()) as { markets?: Array<{ id?: unknown; type?: unknown }> };
  if (!Array.isArray(data.markets)) throw new Error('market list: malformed response');

  const valid = data.markets.filter(
    (m): m is { id: string; type: string } =>
      typeof m.id === 'string' && /^0x[0-9a-f]{64}$/i.test(m.id) && typeof m.type === 'string',
  );

  // Keep the package filter the create_market scan enforced: getMarketPackage
  // defaults unknown markets to v5, so a market from an unrelated publish would
  // render and then build moveCalls against the wrong package. Fail open when
  // nothing matches (an upgrade moves type tags) rather than blank the page.
  const wanted: string[] = [
    PREDICTION_PACKAGE_ID,
    PREDICTION_ORIGINAL_PACKAGE_ID,
    LEGACY_PREDICTION_PACKAGE_ID,
    LEGACY_PREDICTION_ORIGINAL_PACKAGE_ID,
  ]
    .filter((p) => typeof p === 'string' && p.length > 0)
    .map((p) => p.toLowerCase());
  const matched = valid.filter((m) =>
    wanted.some((p) => m.type.toLowerCase().startsWith(`${p}::`)),
  );
  if (wanted.length > 0 && matched.length === 0 && valid.length > 0) {
    console.warn(
      `Market list: no type matched the configured prediction packages; using all ${valid.length}`,
    );
  }
  return (matched.length > 0 ? matched : valid).map((m) => m.id);
}

export async function fetchMarketsByEvents(): Promise<string[]> {
  let indexerError: unknown = null;
  try {
    const fromIndexer = await fetchMarketIdsFromIndexer();
    if (fromIndexer.length > 0) return fromIndexer;
    console.warn('Indexer returned no markets; falling back to create_market scan');
  } catch (error) {
    indexerError = error;
    console.warn('Indexer market list unavailable, falling back to create_market scan:', error);
  }

  const client = getSuiClient();
  // queryTransactionBlocks' MoveFunction filter matches the package the call
  // TARGETED, i.e. the latest published id (not the upgrade-stable originalId
  // that event type tags carry). Use the latest v5 + legacy latest ids so an
  // upgrade of the prediction package does not silently drop every create_market
  // tx and blank the list again.
  const callPackageIds = Array.from(
    new Set([PREDICTION_PACKAGE_ID, LEGACY_PREDICTION_PACKAGE_ID]),
  ).filter((p) => typeof p === 'string' && p.length > 0);

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const pkg of callPackageIds) {
    let cursor: string | null | undefined = null;
    for (let page = 0; page < 40 && ids.length < MAX_MARKETS_DISCOVERY; page++) {
      let res: Awaited<ReturnType<typeof client.queryTransactionBlocks>>;
      try {
        res = await client.queryTransactionBlocks({
          filter: {
            MoveFunction: { package: pkg, module: 'prediction_market', function: 'create_market' },
          },
          options: { showEffects: true },
          order: 'descending',
          limit: 50,
          cursor: cursor ?? undefined,
        });
      } catch (error) {
        console.error('Failed to discover markets via create_market txs:', error);
        break;
      }
      for (const tx of res.data) {
        const marketRef = (tx.effects?.created ?? []).find(
          (c) => c.owner && typeof c.owner === 'object' && 'Shared' in c.owner,
        );
        if (marketRef && !seen.has(marketRef.reference.objectId)) {
          seen.add(marketRef.reference.objectId);
          ids.push(marketRef.reference.objectId);
        }
      }
      if (!res.hasNextPage || !res.nextCursor) break;
      cursor = res.nextCursor;
    }
  }
  if (ids.length > 0) return ids;
  // Both sources came up empty. If the indexer was unreachable this is a
  // failure, not an empty market set, and must surface as an error instead of
  // an innocuous "no markets" page (2026-08-09 went unnoticed for four days
  // precisely because a broken discovery looked like an empty one).
  if (indexerError) {
    throw new Error(
      `Market list unavailable: indexer failed (${
        indexerError instanceof Error ? indexerError.message : String(indexerError)
      }) and the on-chain create_market scan returned nothing.`,
    );
  }
  return TEST_MARKETS;
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
