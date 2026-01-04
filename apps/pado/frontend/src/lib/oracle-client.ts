/**
 * Oracle Client - Fetch prices from DevOracle on-chain
 *
 * Devnet: Uses AdminCap-based oracle
 * Mainnet: Will switch to PythOracleClient via interface abstraction
 *
 * @version 0.1.0
 */

import { SuiClient } from '@mysten/sui/client';

// ========================================
// Constants
// ========================================

const ORACLE_REGISTRY_ID =
  import.meta.env.VITE_ORACLE_REGISTRY_ID ||
  '0x023944875d36fe148facf696cc00b6c4a850074556890e547dcd61f5d8710b9b';

const DECIMALS = 8;

// Symbol ID mapping (must match dev_oracle.move constants)
export const SYMBOLS = {
  BTCUSD: 1,
  ETHUSD: 2,
  NASUSD: 3,
} as const;

export type SymbolKey = keyof typeof SYMBOLS;

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
    const result = await client.getDynamicFieldObject({
      parentId: ORACLE_REGISTRY_ID,
      name: {
        type: 'u64',
        value: SYMBOLS[symbol].toString(),
      },
    });

    if (!result.data?.content || result.data.content.dataType !== 'moveObject') {
      console.warn(`[Oracle] Feed not found for ${symbol}`);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fields = (result.data.content as any).fields?.value?.fields;
    if (!fields) {
      console.warn(`[Oracle] Invalid feed structure for ${symbol}`);
      return null;
    }

    const rawPrice = BigInt(fields.price);
    const rawConfidence = BigInt(fields.confidence);
    const divisor = Math.pow(10, DECIMALS);

    return {
      price: Number(rawPrice) / divisor,
      confidence: Number(rawConfidence) / divisor,
      timestamp: Number(fields.timestamp),
      symbol,
      raw: {
        price: rawPrice,
        confidence: rawConfidence,
      },
    };
  } catch (error) {
    console.error(`[Oracle] Error fetching ${symbol}:`, error);
    return null;
  }
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
  const results: Record<SymbolKey, PriceData | null> = {
    BTCUSD: null,
    ETHUSD: null,
    NASUSD: null,
  };

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
 * Fetch prices from Binance API (fallback for bot/testing)
 *
 * Note: Not used in frontend - only for price-updater bot
 */
export async function fetchBinancePrices(): Promise<{
  BTC: number;
  ETH: number;
}> {
  try {
    // Try CoinGecko first
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd'
    );
    const data = await response.json();
    return {
      BTC: data.bitcoin?.usd ?? 97000,
      ETH: data.ethereum?.usd ?? 3400,
    };
  } catch {
    // Fallback to Binance
    console.log('[Oracle] CoinGecko failed, using Binance fallback');
    try {
      const [btcRes, ethRes] = await Promise.all([
        fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
        fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT'),
      ]);
      const btcData: BinanceTickerResponse = await btcRes.json();
      const ethData: BinanceTickerResponse = await ethRes.json();
      return {
        BTC: parseFloat(btcData.price),
        ETH: parseFloat(ethData.price),
      };
    } catch {
      // Last resort: return defaults
      console.warn('[Oracle] All APIs failed, using default prices');
      return { BTC: 97000, ETH: 3400 };
    }
  }
}
