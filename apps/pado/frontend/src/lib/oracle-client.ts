/**
 * Oracle Client - Fetch prices from DevOracle on-chain
 *
 * Devnet: Uses AdminCap-based oracle
 * Mainnet: Will switch to PythOracleClient via interface abstraction
 *
 * @version 0.1.0
 */

import { SuiClient } from '@mysten/sui/client';
import { logOnce, logThrottled } from './logger';

// ========================================
// Constants
// ========================================

const ORACLE_REGISTRY_ID =
  import.meta.env.VITE_ORACLE_REGISTRY_ID || '';

const DECIMALS = 8;

// Cache the Table object ID (resolved from registry on first call)
let feedsTableId: string | null = null;

// Symbol ID mapping (must match dev_oracle.move constants)
export const SYMBOLS = {
  BTCUSD: 1,
  ETHUSD: 2,
  NASUSD: 3,
  SOLUSD: 4,
} as const;

export type SymbolKey = keyof typeof SYMBOLS;

// ========================================
// Helpers
// ========================================

/**
 * Safely extract fields from a Sui MoveObject response.
 * Returns null if content is missing or not a MoveObject.
 */
function getMoveFields(
  content: { dataType: string; fields?: unknown } | null | undefined
): Record<string, unknown> | null {
  if (!content || content.dataType !== 'moveObject') return null;
  if (!content.fields || typeof content.fields !== 'object' || Array.isArray(content.fields)) return null;
  return content.fields as Record<string, unknown>;
}

/**
 * Walk a dot-separated path through nested Sui MoveObject fields.
 * Each segment navigates into `.fields` of the current object.
 * Returns the leaf value, or undefined if any segment is missing.
 *
 * Example: getNestedField(fields, 'feeds.id.id')
 *   → fields.feeds?.fields?.id?.fields?.id  (Sui Table wraps each level in { fields: ... })
 */
function getNestedField(fields: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = fields;
  for (const key of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    const obj = current as Record<string, unknown>;
    const next = obj[key];
    if (next == null) return undefined;
    // Unwrap Sui's { fields: { ... } } wrapper if present
    if (typeof next === 'object' && !Array.isArray(next) && 'fields' in (next as object)) {
      current = (next as Record<string, unknown>).fields;
    } else {
      current = next;
    }
  }
  return current;
}

/**
 * Safely parse a value to BigInt. Returns null on failure.
 */
function safeBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' || typeof value === 'number') {
    try { return BigInt(value); } catch { return null; }
  }
  return null;
}

// ========================================
// Types
// ========================================

export interface PriceData {
  price: number;
  confidence: number;
  timestamp: number;
  symbol: SymbolKey;
  raw: {
    price: bigint;
    confidence: bigint;
  };
}

// ========================================
// Functions
// ========================================

/**
 * Resolve the Table<u64, PriceFeed> object ID from the OracleRegistry.
 * The registry stores feeds in a Table, which is a separate Sui object.
 * Dynamic fields are on the Table, not on the registry itself.
 */
async function resolveFeedsTableId(client: SuiClient): Promise<string | null> {
  if (feedsTableId) return feedsTableId;

  if (!ORACLE_REGISTRY_ID) {
    logOnce('oracle-registry-missing', 'warn', '[Oracle] VITE_ORACLE_REGISTRY_ID not configured. Oracle prices unavailable.');
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
    if (tableId) {
      feedsTableId = tableId;
      console.log(`[Oracle] Resolved feeds table: ${tableId.slice(0, 16)}...`);
    }
    return feedsTableId;
  } catch (error) {
    logThrottled('oracle-feeds-resolve', 'error', 60_000, '[Oracle] Failed to resolve feeds table:', error);
    return null;
  }
}

/**
 * Get price data from on-chain oracle
 *
 * @param client - SuiClient instance
 * @param symbol - Symbol key (BTCUSD, ETHUSD, NASUSD)
 * @returns PriceData or null if not found
 */
export async function getPrice(
  client: SuiClient,
  symbol: SymbolKey
): Promise<PriceData | null> {
  try {
    const tableId = await resolveFeedsTableId(client);
    if (!tableId) {
      logOnce('oracle-feeds-unresolved', 'warn', '[Oracle] Cannot resolve feeds table ID. Using simulated prices.');
      return null;
    }

    const result = await client.getDynamicFieldObject({
      parentId: tableId,
      name: {
        type: 'u64',
        value: SYMBOLS[symbol].toString(),
      },
    });

    const outerFields = getMoveFields(result.data?.content);
    if (!outerFields) {
      console.warn(`[Oracle] Feed not found for ${symbol}`);
      return null;
    }

    const rawPrice = safeBigInt(getNestedField(outerFields, 'value.price'));
    const rawConfidence = safeBigInt(getNestedField(outerFields, 'value.confidence'));
    const timestamp = getNestedField(outerFields, 'value.timestamp');

    if (rawPrice === null || rawConfidence === null || timestamp == null) {
      console.warn(`[Oracle] Invalid feed data for ${symbol}`);
      return null;
    }

    const divisor = Math.pow(10, DECIMALS);

    return {
      price: Number(rawPrice) / divisor,
      confidence: Number(rawConfidence) / divisor,
      timestamp: Number(timestamp),
      symbol,
      raw: {
        price: rawPrice,
        confidence: rawConfidence,
      },
    };
  } catch (error) {
    logThrottled(`oracle-price-${symbol}`, 'error', 60_000, `[Oracle] Error fetching ${symbol}:`, error);
    return null;
  }
}

/**
 * Get price with staleness validation.
 * Throws if price is unavailable or stale, preventing trades with outdated data.
 *
 * @param client - SuiClient instance
 * @param symbol - Symbol key
 * @param maxStaleMs - Maximum acceptable age (default: 120 seconds)
 * @returns Validated PriceData
 * @throws Error if price is unavailable or stale
 */
export async function getPriceWithValidation(
  client: SuiClient,
  symbol: SymbolKey,
  maxStaleMs: number = 120_000
): Promise<PriceData> {
  const price = await getPrice(client, symbol);

  if (!price) {
    throw new Error(`[Oracle] Price unavailable for ${symbol}. Cannot proceed with trade.`);
  }

  if (!isFresh(price, maxStaleMs)) {
    const ageMs = Date.now() - price.timestamp;
    throw new Error(
      `[Oracle] Price stale for ${symbol}. ` +
      `Age: ${Math.floor(ageMs / 1000)}s, Max: ${Math.floor(maxStaleMs / 1000)}s. ` +
      `Wait for fresh oracle data before trading.`
    );
  }

  return price;
}

/**
 * Get all prices at once
 *
 * @param client - SuiClient instance
 * @returns Record of symbol to PriceData
 */
export async function getAllPrices(
  client: SuiClient
): Promise<Record<SymbolKey, PriceData | null>> {
  const symbols = Object.keys(SYMBOLS) as SymbolKey[];
  const results = Object.fromEntries(
    symbols.map(s => [s, null])
  ) as Record<SymbolKey, PriceData | null>;

  // Fetch in parallel
  await Promise.all(
    symbols.map(async (symbol) => {
      results[symbol] = await getPrice(client, symbol);
    })
  );

  return results;
}

/**
 * Check if price is fresh (within max age)
 *
 * @param price - PriceData to check
 * @param maxAgeMs - Maximum age in milliseconds (default: 60 seconds)
 * @returns true if fresh
 */
export function isFresh(price: PriceData | null, maxAgeMs: number = 60_000): boolean {
  if (!price) return false;
  return Date.now() - price.timestamp <= maxAgeMs;
}

/**
 * Format price for display
 *
 * @param price - Price number
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted price string
 */
export function formatPrice(price: number, decimals: number = 2): string {
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ========================================
// Fallback Price Provider (for testing)
// ========================================

interface BinanceTickerResponse {
  symbol: string;
  price: string;
}

/**
 * Fetch BTC price from external APIs (fallback for bot/testing)
 *
 * Note: Not used in frontend - only for price-updater bot.
 * Throws on failure to prevent stale/hardcoded prices from being
 * pushed to the oracle, which could cause wrongful liquidations.
 */
export async function fetchBinancePrices(): Promise<{
  BTC: number;
}> {
  const errors: string[] = [];

  // Try CoinGecko first
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
    );
    if (!response.ok) {
      throw new Error(`CoinGecko HTTP ${response.status}`);
    }
    const data = await response.json();
    const btc = data.bitcoin?.usd;
    if (typeof btc !== 'number' || btc <= 0) {
      throw new Error(`CoinGecko returned invalid data: BTC=${btc}`);
    }
    return { BTC: btc };
  } catch (e) {
    errors.push(`CoinGecko: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Fallback to Binance
  try {
    const btcRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    if (!btcRes.ok) {
      throw new Error(`Binance HTTP BTC=${btcRes.status}`);
    }
    const btcData: BinanceTickerResponse = await btcRes.json();
    const btc = parseFloat(btcData.price);
    if (isNaN(btc) || btc <= 0) {
      throw new Error(`Binance returned invalid price: BTC=${btcData.price}`);
    }
    return { BTC: btc };
  } catch (e) {
    errors.push(`Binance: ${e instanceof Error ? e.message : String(e)}`);
  }

  // All sources failed - throw instead of returning hardcoded prices
  // to prevent stale data from being pushed to the oracle
  throw new Error(
    `[Oracle] All external price sources failed. Oracle update aborted.\n` +
    errors.map(e => `  - ${e}`).join('\n')
  );
}
