/**
 * Price Source Module
 *
 * Fetches BTC/USDT price from Binance API with caching.
 */

import { timestamp } from './config.js';

// ========================================
// Configuration
// ========================================

const BINANCE_API_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT';
const CACHE_TTL_MS = 5000; // 5 seconds cache
const MAX_FALLBACK_AGE_MS = 60_000; // 1 minute max staleness for fallback

// ========================================
// Cache State
// ========================================

let cachedPrice: number | null = null;
let cacheTimestamp = 0;

// ========================================
// Price Fetching
// ========================================

/**
 * Fetch BTC/USDT price from Binance API
 * Uses caching to avoid rate limiting
 */
export async function fetchBtcPrice(): Promise<number> {
  const now = Date.now();

  // Return cached price if still valid
  if (cachedPrice !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedPrice;
  }

  try {
    const response = await fetch(BINANCE_API_URL, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as { symbol: string; price: string };

    if (!data.price) {
      throw new Error('Invalid Binance response: missing price');
    }

    const price = parseFloat(data.price);

    if (isNaN(price) || price <= 0) {
      throw new Error(`Invalid price value: ${data.price}`);
    }

    // Update cache
    cachedPrice = price;
    cacheTimestamp = now;

    return price;
  } catch (error) {
    // If we have a cached price, use it as fallback (with staleness check)
    if (cachedPrice !== null) {
      const age = now - cacheTimestamp;
      if (age < MAX_FALLBACK_AGE_MS) {
        console.log(`[${timestamp()}] Warning: Binance fetch failed, using cached price (${(age / 1000).toFixed(0)}s old): $${cachedPrice.toLocaleString()}`);
        return cachedPrice;
      }
      console.error(`[${timestamp()}] Cached price too stale (${(age / 1000).toFixed(0)}s), refusing to use`);
    }

    throw new Error(`Failed to fetch BTC price: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Validate price against sanity bounds
 */
export function validatePrice(price: number, minPrice: number, maxPrice: number): boolean {
  return price >= minPrice && price <= maxPrice;
}

/**
 * Calculate price change in basis points
 */
export function priceChangeBps(oldPrice: number, newPrice: number): number {
  if (oldPrice <= 0) return 0;
  return Math.abs((newPrice - oldPrice) / oldPrice) * 10000;
}
