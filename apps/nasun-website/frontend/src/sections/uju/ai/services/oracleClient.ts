/**
 * oracleClient - minimal on-chain price reader for Nasun AI agent overviews.
 *
 * Ports just enough of apps/pado/frontend/src/lib/oracle-client.ts to mark
 * agent holdings to market. We keep this slim because the agent overview is
 * the only nasun-website consumer right now; if a second caller appears,
 * promote to a shared `@nasun/oracle-client` package.
 *
 * What we keep:
 *   - Lazy resolution of feeds table + per-symbol dynamic field IDs (cached).
 *   - Single multiGetObjects batch for all symbols (1 RPC after warmup).
 *
 * What we drop vs Pado:
 *   - Staleness validation (callers can check timestamp).
 *   - logger/logThrottled helpers (just console.warn once for missing config).
 *   - NSN deepbook mid-price override (agent overview shows oracle price; if
 *     drift becomes user-visible, port the override too).
 */
import type { SuiClient } from '@mysten/sui/client';

const ORACLE_REGISTRY_ID = (import.meta.env.VITE_ORACLE_REGISTRY_ID as string | undefined) || '';
const DECIMALS = 8;

export const ORACLE_SYMBOLS = {
  BTCUSD: 1,
  ETHUSD: 2,
  NASUSD: 3,
  SOLUSD: 4,
} as const;
export type OracleSymbol = keyof typeof ORACLE_SYMBOLS;

export interface OraclePrice {
  symbol: OracleSymbol;
  price: number;
  timestampMs: number;
}

let feedsTableId: string | null = null;
const feedObjectIds = new Map<number, string>();
let warnedMissing = false;
let inflightBatch: Promise<Record<OracleSymbol, OraclePrice | null>> | null = null;

function getMoveFields(
  content: { dataType?: string; fields?: unknown } | null | undefined,
): Record<string, unknown> | null {
  if (!content || content.dataType !== 'moveObject') return null;
  if (!content.fields || typeof content.fields !== 'object' || Array.isArray(content.fields)) {
    return null;
  }
  return content.fields as Record<string, unknown>;
}

function getNestedField(fields: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = fields;
  for (const key of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    const obj = current as Record<string, unknown>;
    const next = obj[key];
    if (next == null) return undefined;
    if (typeof next === 'object' && !Array.isArray(next) && 'fields' in (next as object)) {
      current = (next as Record<string, unknown>).fields;
    } else {
      current = next;
    }
  }
  return current;
}

function safeBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' || typeof value === 'number') {
    try { return BigInt(value); } catch { return null; }
  }
  return null;
}

async function resolveFeedsTableId(client: SuiClient): Promise<string | null> {
  if (feedsTableId) return feedsTableId;
  if (!ORACLE_REGISTRY_ID) {
    if (!warnedMissing) {
      console.warn('[oracleClient] VITE_ORACLE_REGISTRY_ID not configured; prices unavailable.');
      warnedMissing = true;
    }
    return null;
  }
  try {
    const registry = await client.getObject({
      id: ORACLE_REGISTRY_ID,
      options: { showContent: true },
    });
    const fields = getMoveFields(registry.data?.content);
    if (!fields) return null;
    const tableId = getNestedField(fields, 'feeds.id.id') as string | undefined;
    if (tableId) feedsTableId = tableId;
    return feedsTableId;
  } catch (err) {
    console.warn('[oracleClient] Failed to resolve feeds table:', err);
    return null;
  }
}

async function resolveFeedObjectId(
  client: SuiClient,
  symbolId: number,
): Promise<string | null> {
  const cached = feedObjectIds.get(symbolId);
  if (cached) return cached;
  const tableId = await resolveFeedsTableId(client);
  if (!tableId) return null;
  try {
    const result = await client.getDynamicFieldObject({
      parentId: tableId,
      name: { type: 'u64', value: symbolId.toString() },
    });
    const objectId = result.data?.objectId;
    if (objectId) feedObjectIds.set(symbolId, objectId);
    return objectId ?? null;
  } catch (err) {
    console.warn(`[oracleClient] Failed to resolve feed for symbol ${symbolId}:`, err);
    return null;
  }
}

async function fetchBatchUncached(
  client: SuiClient,
): Promise<Record<OracleSymbol, OraclePrice | null>> {
  const symbols = Object.keys(ORACLE_SYMBOLS) as OracleSymbol[];
  const results = Object.fromEntries(symbols.map((s) => [s, null])) as Record<
    OracleSymbol,
    OraclePrice | null
  >;

  const entries: Array<{ symbol: OracleSymbol; objectId: string }> = [];
  await Promise.all(
    symbols.map(async (symbol) => {
      const objectId = await resolveFeedObjectId(client, ORACLE_SYMBOLS[symbol]);
      if (objectId) entries.push({ symbol, objectId });
    }),
  );
  if (entries.length === 0) return results;

  try {
    const batch = await client.multiGetObjects({
      ids: entries.map((e) => e.objectId),
      options: { showContent: true },
    });
    const divisor = Math.pow(10, DECIMALS);
    for (let i = 0; i < entries.length; i++) {
      const { symbol } = entries[i];
      const obj = batch[i];
      const outer = getMoveFields(obj.data?.content);
      if (!outer) continue;
      const rawPrice = safeBigInt(getNestedField(outer, 'value.price'));
      const timestamp = getNestedField(outer, 'value.timestamp');
      if (rawPrice === null || timestamp == null) continue;
      results[symbol] = {
        symbol,
        price: Number(rawPrice) / divisor,
        timestampMs: Number(timestamp),
      };
    }
  } catch (err) {
    console.warn('[oracleClient] Batch price fetch failed:', err);
  }
  return results;
}

/**
 * Fetch all four oracle prices in one round-trip (after warmup). Concurrent
 * callers within the same tick share one in-flight Promise so React Query's
 * fan-out from many cards doesn't stampede the fullnode.
 */
export async function fetchBatchPrices(
  client: SuiClient,
): Promise<Record<OracleSymbol, OraclePrice | null>> {
  if (inflightBatch) return inflightBatch;
  inflightBatch = (async () => {
    try { return await fetchBatchUncached(client); }
    finally { inflightBatch = null; }
  })();
  return inflightBatch;
}
