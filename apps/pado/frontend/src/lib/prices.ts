/**
 * Unified Price Source
 *
 * Single source of truth for all token prices in USD.
 * This module ensures price consistency across the entire application.
 *
 * Design Principles:
 * - All USD values rounded to 2 decimal places (ROUND_HALF_UP)
 * - Single function getUnifiedPrice() used everywhere
 * - DevOracle integration with 10s TTL cache + simulated fallback
 *
 * @version 1.1.0 (Phase 16.1 - Oracle Integration)
 */

import { getSuiClient } from './sui-client';
import * as oracleClient from './oracle-client';
import type { SymbolKey } from './oracle-client';
import { logOnce, logThrottled } from './logger';

export type TokenSymbol = 'NASUN' | 'NBTC' | 'NUSDC' | 'NETH' | 'NSOL';

// ========================================
// Price Cache (10s TTL)
// ========================================

interface CachedPrice {
  price: number;
  source: 'oracle' | 'simulated';
  timestamp: number;
}

const CACHE_TTL_MS = 10_000; // 10 seconds
const MAX_ORACLE_AGE_MS = 120_000; // 2 minutes (Lambda updates every 1 min)

const priceCache: Map<TokenSymbol, CachedPrice> = new Map();

// ========================================
// Simulated Prices (Fallback)
// ========================================

// Fallback prices when oracle is unavailable or stale
const SIMULATED_PRICES: Record<TokenSymbol, number> = {
  NASUN: 0.10,    // $0.10 per NASUN
  NBTC: 97000,    // $97,000 per BTC
  NUSDC: 1.00,    // $1.00 per USDC (stablecoin)
  NETH: 3500,     // $3,500 per ETH
  NSOL: 200,      // $200 per SOL
};

// Fallback 24h changes (used only when no real data is available)
const FALLBACK_CHANGES: Record<TokenSymbol, number> = {
  NASUN: 0,
  NBTC: 0,
  NUSDC: 0,
  NETH: 0,
  NSOL: 0,
};

// Real 24h price change cache (populated from Binance ticker)
const changeCache: Map<TokenSymbol, { percent: number; timestamp: number }> = new Map();

// ========================================
// Symbol Mapping
// ========================================

// Map Pado token symbols to Oracle symbol keys
const TOKEN_TO_ORACLE_SYMBOL: Partial<Record<TokenSymbol, SymbolKey>> = {
  NBTC: 'BTCUSD',
  NASUN: 'NASUSD',
  NETH: 'ETHUSD',
  NSOL: 'SOLUSD',
  // NUSDC: No oracle needed (always $1.00)
};

// Reverse mapping: on-chain oracle numeric symbol ID → TokenSymbol
// (matches dev_oracle.move: 1=BTC, 2=ETH, 3=NASUN, 4=SOL)
const ORACLE_ID_TO_TOKEN: Record<number, TokenSymbol> = {
  1: 'NBTC',
  2: 'NETH',
  3: 'NASUN',
  4: 'NSOL',
};

// ========================================
// Oracle Integration
// ========================================

/**
 * Fetch price from DevOracle with fallback to simulated price
 *
 * @param symbol - Token symbol
 * @returns Price data with source indicator
 */
export async function fetchOraclePrice(
  symbol: TokenSymbol
): Promise<{ price: number; source: 'oracle' | 'simulated' }> {
  // NUSDC is always $1.00 (stablecoin)
  if (symbol === 'NUSDC') {
    return { price: 1.0, source: 'simulated' };
  }

  const oracleSymbol = TOKEN_TO_ORACLE_SYMBOL[symbol];
  if (!oracleSymbol) {
    return { price: SIMULATED_PRICES[symbol], source: 'simulated' };
  }

  try {
    const client = getSuiClient();
    const priceData = await oracleClient.getPrice(client, oracleSymbol);

    // Check if price exists and is fresh
    if (priceData && oracleClient.isFresh(priceData, MAX_ORACLE_AGE_MS)) {
      return { price: priceData.price, source: 'oracle' };
    }

    // Oracle stale or unavailable - use simulated (log once per symbol)
    if (priceData) {
      const ageMs = Date.now() - priceData.timestamp;
      logOnce(
        `prices-${symbol}-stale`, 'warn',
        `[Prices] Oracle ${oracleSymbol} stale (age: ${Math.round(ageMs / 1000)}s, max: ${MAX_ORACLE_AGE_MS / 1000}s), using simulated price ($${SIMULATED_PRICES[symbol]}).`
      );
    } else {
      logOnce(
        `prices-${symbol}-unavailable`, 'warn',
        `[Prices] Oracle ${oracleSymbol} unavailable, using simulated price ($${SIMULATED_PRICES[symbol]}).`
      );
    }
    return { price: SIMULATED_PRICES[symbol], source: 'simulated' };
  } catch (error) {
    logThrottled(
      `prices-${symbol}-error`, 'error', 60_000,
      `[Prices] Failed to fetch oracle price for ${symbol}:`, error
    );
    return { price: SIMULATED_PRICES[symbol], source: 'simulated' };
  }
}

/**
 * Refresh price cache for a symbol (call this periodically)
 *
 * @param symbol - Token symbol to refresh
 */
export async function refreshPrice(symbol: TokenSymbol): Promise<void> {
  const { price, source } = await fetchOraclePrice(symbol);
  priceCache.set(symbol, {
    price,
    source,
    timestamp: Date.now(),
  });
}

/**
 * Refresh all prices in cache
 */
export async function refreshAllPrices(): Promise<void> {
  const symbols: TokenSymbol[] = ['NASUN', 'NBTC', 'NUSDC', 'NETH', 'NSOL'];
  await Promise.all(symbols.map(refreshPrice));
}

/**
 * Get unified price for a token symbol (sync, from cache or simulated)
 *
 * Uses cached oracle price if available and fresh, otherwise returns simulated.
 * Call refreshPrice() or refreshAllPrices() to update cache from oracle.
 *
 * @param symbol - Token symbol (NASUN, NBTC, NUSDC)
 * @returns Price in USD
 *
 * @example
 * const btcPrice = getUnifiedPrice('NBTC'); // 97000
 */
export function getUnifiedPrice(symbol: TokenSymbol): number {
  const cached = priceCache.get(symbol);

  // Return cached price if fresh
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.price;
  }

  // Fallback to simulated price (cache miss or stale)
  return SIMULATED_PRICES[symbol] ?? 0;
}

/**
 * Get price source for a symbol
 *
 * @param symbol - Token symbol
 * @returns 'oracle' | 'simulated' | 'unknown'
 */
export function getPriceSource(symbol: TokenSymbol): 'oracle' | 'simulated' | 'unknown' {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.source;
  }
  return 'unknown';
}

/**
 * Resolve oracle numeric symbol ID to TokenSymbol.
 * Returns null for unknown IDs (e.g., ETH=2 has no token mapping yet).
 */
export function getTokenByOracleId(symbolId: number): TokenSymbol | null {
  return ORACLE_ID_TO_TOKEN[symbolId] ?? null;
}

/**
 * Get price with freshness metadata (used by perp and other modules).
 * Returns cached oracle data if available, otherwise simulated fallback.
 */
export function getPriceWithFreshness(symbol: TokenSymbol): {
  price: number;
  timestamp: number;
  isFresh: boolean;
  source: 'oracle' | 'simulated' | 'unknown';
} {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      price: cached.price,
      timestamp: cached.timestamp,
      isFresh: cached.source === 'oracle',
      source: cached.source,
    };
  }
  return {
    price: SIMULATED_PRICES[symbol] ?? 0,
    timestamp: 0,
    isFresh: false,
    source: 'unknown',
  };
}

/**
 * Set real 24h price change from external source (e.g., Binance 24h ticker).
 * Call this from TradePage when ticker data arrives.
 *
 * @param symbol - Token symbol
 * @param percent - Change percentage (e.g., 2.5 means +2.5%)
 */
export function set24hChange(symbol: TokenSymbol, percent: number): void {
  changeCache.set(symbol, { percent, timestamp: Date.now() });
}

/**
 * Get 24h price change percentage for a token.
 * Returns real Binance data if available, otherwise fallback (0%).
 *
 * @param symbol - Token symbol
 * @returns Change percentage (e.g., 2.5 means +2.5%)
 */
export function getPriceChange24h(symbol: TokenSymbol): number {
  // NUSDC is always 0% (stablecoin)
  if (symbol === 'NUSDC') return 0;

  const cached = changeCache.get(symbol);
  // Accept cached data up to 5 minutes old
  if (cached && Date.now() - cached.timestamp < 300_000) {
    return cached.percent;
  }
  return FALLBACK_CHANGES[symbol] ?? 0;
}

/**
 * Get all unified prices at once
 *
 * @returns Record of all token prices
 */
export function getAllPrices(): Record<TokenSymbol, number> {
  const result = { ...SIMULATED_PRICES };
  for (const symbol of Object.keys(result) as TokenSymbol[]) {
    result[symbol] = getUnifiedPrice(symbol);
  }
  return result;
}

/**
 * Calculate USD value from token amount
 *
 * @param symbol - Token symbol
 * @param amount - Token amount (human-readable, not raw)
 * @returns USD value rounded to 2 decimal places
 *
 * @example
 * const usdValue = calculateUsdValue('NBTC', 0.5); // 48500.00
 */
export function calculateUsdValue(symbol: TokenSymbol, amount: number): number {
  const price = getUnifiedPrice(symbol);
  const value = amount * price;
  // ROUND_HALF_UP to 2 decimal places
  return Math.round(value * 100) / 100;
}

/**
 * Calculate 24h PnL from current value
 *
 * @param symbol - Token symbol
 * @param currentUsdValue - Current USD value
 * @returns 24h PnL in USD
 */
export function calculate24hPnl(symbol: TokenSymbol, currentUsdValue: number): number {
  const changePercent = getPriceChange24h(symbol);
  // PnL = currentValue - previousValue
  // currentValue = previousValue * (1 + change/100)
  // PnL = currentValue - currentValue / (1 + change/100)
  //     = currentValue * (1 - 1/(1 + change/100))
  //     = currentValue * change / (100 + change)
  const pnl = currentUsdValue * (changePercent / (100 + changePercent));
  return Math.round(pnl * 100) / 100;
}

/**
 * Format USD value for display
 *
 * @param value - USD value
 * @param options - Formatting options
 * @returns Formatted string (e.g., "$1,234.56")
 */
export function formatUsdValue(
  value: number,
  options: {
    showSign?: boolean;
    compact?: boolean;
  } = {}
): string {
  const { showSign = false, compact = false } = options;

  if (compact && Math.abs(value) >= 1000) {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);

    if (showSign && value > 0) {
      return `+${formatted}`;
    }
    return formatted;
  }

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  if (showSign && value > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

/**
 * Format percentage for display
 *
 * @param percent - Percentage value (e.g., 2.5 for +2.5%)
 * @returns Formatted string (e.g., "+2.50%")
 */
export function formatPercentage(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}
