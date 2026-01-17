/**
 * Default Price Provider
 *
 * Provides token prices from CoinGecko API with simulated price fallback.
 * Apps can provide custom implementations via PortfolioConfig.priceProvider.
 */

import type { PriceProvider, TokenPrice } from '../../types/portfolio';

// Symbol to CoinGecko ID mapping
const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  WBTC: 'wrapped-bitcoin',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  MATIC: 'matic-network',
  ARB: 'arbitrum',
  OP: 'optimism',
  LINK: 'chainlink',
};

// Simulated prices for devnet/testnet tokens
const SIMULATED_PRICES: Record<string, number> = {
  NSN: 0.1,
  NBTC: 97000,
  NUSDC: 1.0,
  ETH: 3400,
  BTC: 97000,
  WBTC: 97000,
  USDC: 1.0,
  USDT: 1.0,
  DAI: 1.0,
  MATIC: 0.5,
  ARB: 1.2,
  OP: 2.5,
};

export interface DefaultPriceProviderOptions {
  /** Cache TTL in milliseconds (default: 30000) */
  cacheTtlMs?: number;
  /** Fetch timeout in milliseconds (default: 5000) */
  fetchTimeoutMs?: number;
}

/**
 * Default price provider using CoinGecko API with simulated fallback.
 */
export class DefaultPriceProvider implements PriceProvider {
  private cache: Map<string, TokenPrice> = new Map();
  private readonly cacheTtlMs: number;
  private readonly fetchTimeoutMs: number;

  constructor(options?: DefaultPriceProviderOptions) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 30_000;
    this.fetchTimeoutMs = options?.fetchTimeoutMs ?? 5_000;
  }

  async getPrice(symbol: string): Promise<TokenPrice | null> {
    const upperSymbol = symbol.toUpperCase();

    // Check cache
    const cached = this.cache.get(upperSymbol);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached;
    }

    // Try CoinGecko API
    const coingeckoId = COINGECKO_IDS[upperSymbol];
    if (coingeckoId) {
      try {
        const price = await this.fetchFromCoinGecko(coingeckoId, upperSymbol);
        if (price) {
          this.cache.set(upperSymbol, price);
          return price;
        }
      } catch (error) {
        console.warn(`[PriceProvider] CoinGecko fetch failed for ${symbol}:`, error);
      }
    }

    // Fallback to simulated price
    const simulatedPrice = SIMULATED_PRICES[upperSymbol];
    if (simulatedPrice !== undefined) {
      const price: TokenPrice = {
        symbol: upperSymbol,
        priceUsd: simulatedPrice,
        source: 'simulated',
        timestamp: Date.now(),
      };
      this.cache.set(upperSymbol, price);
      return price;
    }

    return null;
  }

  async getPrices(symbols: string[]): Promise<Record<string, TokenPrice>> {
    const results: Record<string, TokenPrice> = {};

    // Separate symbols into cached, CoinGecko-fetchable, and simulated-only
    const uncached: string[] = [];
    const coingeckoSymbols: string[] = [];

    for (const symbol of symbols) {
      const upperSymbol = symbol.toUpperCase();
      const cached = this.cache.get(upperSymbol);

      if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
        results[upperSymbol] = cached;
      } else {
        uncached.push(upperSymbol);
        if (COINGECKO_IDS[upperSymbol]) {
          coingeckoSymbols.push(upperSymbol);
        }
      }
    }

    // Batch fetch from CoinGecko
    if (coingeckoSymbols.length > 0) {
      try {
        const batchPrices = await this.fetchBatchFromCoinGecko(coingeckoSymbols);
        for (const [symbol, price] of Object.entries(batchPrices)) {
          results[symbol] = price;
          this.cache.set(symbol, price);
        }
      } catch (error) {
        console.warn('[PriceProvider] CoinGecko batch fetch failed:', error);
      }
    }

    // Fill in remaining with simulated prices
    for (const symbol of uncached) {
      if (!results[symbol]) {
        const simulatedPrice = SIMULATED_PRICES[symbol];
        if (simulatedPrice !== undefined) {
          const price: TokenPrice = {
            symbol,
            priceUsd: simulatedPrice,
            source: 'simulated',
            timestamp: Date.now(),
          };
          results[symbol] = price;
          this.cache.set(symbol, price);
        }
      }
    }

    return results;
  }

  /**
   * Clear the price cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  private async fetchFromCoinGecko(
    coingeckoId: string,
    symbol: string
  ): Promise<TokenPrice | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (!data[coingeckoId]) {
        return null;
      }

      return {
        symbol,
        priceUsd: data[coingeckoId].usd,
        change24h: data[coingeckoId].usd_24h_change,
        source: 'api',
        timestamp: Date.now(),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async fetchBatchFromCoinGecko(
    symbols: string[]
  ): Promise<Record<string, TokenPrice>> {
    const ids = symbols
      .map((s) => COINGECKO_IDS[s])
      .filter(Boolean)
      .join(',');

    if (!ids) {
      return {};
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
        { signal: controller.signal }
      );

      if (!response.ok) {
        return {};
      }

      const data = await response.json();
      const results: Record<string, TokenPrice> = {};

      for (const symbol of symbols) {
        const coingeckoId = COINGECKO_IDS[symbol];
        if (coingeckoId && data[coingeckoId]) {
          results[symbol] = {
            symbol,
            priceUsd: data[coingeckoId].usd,
            change24h: data[coingeckoId].usd_24h_change,
            source: 'api',
            timestamp: Date.now(),
          };
        }
      }

      return results;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
