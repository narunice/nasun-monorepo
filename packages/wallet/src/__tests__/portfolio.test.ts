/**
 * Portfolio Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultPriceProvider } from '../core/portfolio/price-provider';
import { getAllTokens, registerToken, registerTokens, clearTokens, DEVNET_TOKENS } from '../config/tokens';
import type {
  TokenAsset,
  PortfolioSummary,
  TokenPrice,
  PriceProvider,
  ERC20TokenConfig,
} from '../types/portfolio';

describe('Portfolio', () => {
  describe('DefaultPriceProvider', () => {
    let provider: DefaultPriceProvider;

    beforeEach(() => {
      provider = new DefaultPriceProvider({ cacheTtlMs: 1000 });
      vi.clearAllMocks();
    });

    it('should return simulated price for NSN', async () => {
      const price = await provider.getPrice('NSN');

      expect(price).not.toBeNull();
      expect(price?.symbol).toBe('NSN');
      expect(price?.priceUsd).toBe(0.1);
      expect(price?.source).toBe('simulated');
    });

    it('should return simulated price for NBTC', async () => {
      const price = await provider.getPrice('NBTC');

      expect(price).not.toBeNull();
      expect(price?.symbol).toBe('NBTC');
      expect(price?.priceUsd).toBe(97000);
      expect(price?.source).toBe('simulated');
    });

    it('should return simulated price for NUSDC', async () => {
      const price = await provider.getPrice('NUSDC');

      expect(price).not.toBeNull();
      expect(price?.symbol).toBe('NUSDC');
      expect(price?.priceUsd).toBe(1.0);
      expect(price?.source).toBe('simulated');
    });

    it('should return simulated price for NETH (pegged to ETH)', async () => {
      const price = await provider.getPrice('NETH');

      expect(price).not.toBeNull();
      expect(price?.symbol).toBe('NETH');
      expect(price?.priceUsd).toBe(2000);
      expect(price?.source).toBe('simulated');
    });

    it('should return simulated price for NSOL (pegged to SOL)', async () => {
      const price = await provider.getPrice('NSOL');

      expect(price).not.toBeNull();
      expect(price?.symbol).toBe('NSOL');
      expect(price?.priceUsd).toBe(85);
      expect(price?.source).toBe('simulated');
    });

    it('should handle case-insensitive symbols', async () => {
      const price1 = await provider.getPrice('nasun');
      const price2 = await provider.getPrice('NSN');
      const price3 = await provider.getPrice('Nasun');

      expect(price1?.priceUsd).toBe(price2?.priceUsd);
      expect(price2?.priceUsd).toBe(price3?.priceUsd);
    });

    it('should cache prices', async () => {
      const price1 = await provider.getPrice('NBTC');
      const price2 = await provider.getPrice('NBTC');

      expect(price1?.timestamp).toBe(price2?.timestamp);
    });

    it('should invalidate cache after TTL', async () => {
      const shortTtlProvider = new DefaultPriceProvider({ cacheTtlMs: 10 });

      const price1 = await shortTtlProvider.getPrice('NSN');
      await new Promise((resolve) => setTimeout(resolve, 20));
      const price2 = await shortTtlProvider.getPrice('NSN');

      // Timestamps should be different after cache expiration
      expect(price2?.timestamp).toBeGreaterThan(price1?.timestamp ?? 0);
    });

    it('should fetch multiple prices', async () => {
      const prices = await provider.getPrices(['NSN', 'NBTC', 'NUSDC']);

      expect(Object.keys(prices)).toHaveLength(3);
      expect(prices['NSN'].priceUsd).toBe(0.1);
      expect(prices['NBTC'].priceUsd).toBe(97000);
      expect(prices['NUSDC'].priceUsd).toBe(1.0);
    });

    // Regression: usePortfolio batches every held symbol through getPrices, then
    // values each asset by prices[symbol]. NETH/NSOL were absent from every price
    // map, so getPrices returned no entry and the portfolio rendered them at $0.00.
    it('should price NETH and NSOL via getPrices so the portfolio never shows $0', async () => {
      const prices = await provider.getPrices(['NETH', 'NSOL']);

      expect(prices['NETH']?.priceUsd).toBe(2000);
      expect(prices['NSOL']?.priceUsd).toBe(85);
    });

    // Guard against the add-token-without-price regression class: every token in
    // the registry can appear in the portfolio (getAllBalances enumerates the
    // registry), so each MUST resolve a positive price. Adding a token without a
    // fallbackPriceUsd fails here instead of silently rendering $0 in production.
    it('prices every registered token (no silent $0)', async () => {
      const symbols = getAllTokens().map((t) => t.symbol);
      expect(symbols.length).toBeGreaterThan(0);

      const prices = await provider.getPrices(symbols);

      for (const symbol of symbols) {
        const price = prices[symbol.toUpperCase()];
        expect(price, `registered token "${symbol}" has no price`).toBeDefined();
        expect(price.priceUsd, `registered token "${symbol}" priced at 0`).toBeGreaterThan(0);
      }
    });

    // A token registered at runtime (registerTokens, as Pado/Gostop do) must also
    // be priced from its fallbackPriceUsd, not just the package-default tokens.
    it('honors fallbackPriceUsd for runtime-registered tokens', async () => {
      registerToken({ symbol: 'NTEST', name: 'Test', decimals: 9, type: '0xtest::t::T', fallbackPriceUsd: 42 });
      try {
        const price = await provider.getPrice('NTEST');
        expect(price?.priceUsd).toBe(42);
        expect(price?.source).toBe('simulated');
      } finally {
        // Restore the default registry so registry-reading tests stay deterministic.
        clearTokens();
        registerTokens(DEVNET_TOKENS);
      }
    });

    it('should return null for unknown symbols', async () => {
      const price = await provider.getPrice('UNKNOWN_TOKEN_XYZ');

      expect(price).toBeNull();
    });

    it('should clear cache', async () => {
      await provider.getPrice('NSN');
      provider.clearCache();
      const price = await provider.getPrice('NSN');

      // New timestamp after cache clear
      expect(price?.timestamp).toBeDefined();
    });
  });

  describe('Portfolio Calculation', () => {
    it('should calculate total value correctly', () => {
      const assets: Partial<TokenAsset>[] = [
        { valueUsd: 100.5 },
        { valueUsd: 200.25 },
        { valueUsd: 50.0 },
      ];

      const total = assets.reduce((sum, a) => sum + (a.valueUsd ?? 0), 0);

      expect(Math.round(total * 100) / 100).toBe(350.75);
    });

    it('should calculate 24h change percentage correctly', () => {
      const currentValue = 1100;
      const previousValue = 1000;

      const changePercent = ((currentValue - previousValue) / previousValue) * 100;

      expect(changePercent).toBe(10);
    });

    it('should calculate negative 24h change', () => {
      const currentValue = 900;
      const previousValue = 1000;

      const changePercent = ((currentValue - previousValue) / previousValue) * 100;

      expect(changePercent).toBe(-10);
    });

    it('should handle zero previous value', () => {
      const currentValue = 100;
      const previousValue = 0;

      const changePercent =
        previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;

      expect(changePercent).toBe(0);
    });

    it('should calculate weighted 24h change from assets', () => {
      // Asset 1: $100, +10%
      // Asset 2: $200, -5%
      // Total: $300
      // Asset 1 previous: $100 / 1.1 = $90.91
      // Asset 2 previous: $200 / 0.95 = $210.53
      // Total previous: $301.44
      // Change: ($300 - $301.44) / $301.44 = -0.48%

      const assets = [
        { valueUsd: 100, change24h: 10 },
        { valueUsd: 200, change24h: -5 },
      ];

      let totalPreviousValue = 0;
      for (const asset of assets) {
        const previousValue = asset.valueUsd / (1 + asset.change24h / 100);
        totalPreviousValue += previousValue;
      }

      const totalValueUsd = assets.reduce((sum, a) => sum + a.valueUsd, 0);
      const changePercent = ((totalValueUsd - totalPreviousValue) / totalPreviousValue) * 100;

      expect(Math.round(changePercent * 100) / 100).toBeCloseTo(-0.48, 1);
    });
  });

  describe('Portfolio Summary', () => {
    it('should create valid portfolio summary', () => {
      const summary: PortfolioSummary = {
        totalValueUsd: 1000,
        change24hUsd: 50,
        change24hPercent: 5,
        assets: [],
        byChain: [],
        lastUpdated: Date.now(),
      };

      expect(summary.totalValueUsd).toBe(1000);
      expect(summary.change24hPercent).toBe(5);
      expect(summary.assets).toHaveLength(0);
    });

    it('should group assets by chain', () => {
      const assets: TokenAsset[] = [
        {
          chainId: 'nasun-devnet',
          chainName: 'Nasun Devnet',
          chainType: 'move',
          symbol: 'NSN',
          name: 'Nasun',
          balance: 1000000000n,
          formattedBalance: '1.0',
          decimals: 9,
          priceUsd: 0.1,
          valueUsd: 0.1,
        },
        {
          chainId: 'nasun-devnet',
          chainName: 'Nasun Devnet',
          chainType: 'move',
          symbol: 'NBTC',
          name: 'NBTC',
          balance: 100000000n,
          formattedBalance: '1.0',
          decimals: 8,
          priceUsd: 97000,
          valueUsd: 97000,
        },
        {
          chainId: 'ethereum',
          chainName: 'Ethereum',
          chainType: 'evm',
          symbol: 'ETH',
          name: 'Ether',
          balance: 1000000000000000000n,
          formattedBalance: '1.0',
          decimals: 18,
          priceUsd: 3400,
          valueUsd: 3400,
        },
      ];

      // Group by chain
      const chainMap = new Map<string, TokenAsset[]>();
      for (const asset of assets) {
        const existing = chainMap.get(asset.chainId) ?? [];
        existing.push(asset);
        chainMap.set(asset.chainId, existing);
      }

      expect(chainMap.size).toBe(2);
      expect(chainMap.get('nasun-devnet')?.length).toBe(2);
      expect(chainMap.get('ethereum')?.length).toBe(1);
    });
  });

  describe('ERC20TokenConfig', () => {
    it('should define valid ERC-20 token config', () => {
      const config: ERC20TokenConfig = {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
      };

      expect(config.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(config.decimals).toBe(6);
    });

    it('should support multiple ERC-20 configs per chain', () => {
      const erc20Tokens: Record<string, ERC20TokenConfig[]> = {
        ethereum: [
          { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
          { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
        ],
        base: [
          { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        ],
      };

      expect(erc20Tokens['ethereum']).toHaveLength(2);
      expect(erc20Tokens['base']).toHaveLength(1);
    });
  });

  describe('Custom PriceProvider', () => {
    it('should support custom price provider implementation', async () => {
      const customProvider: PriceProvider = {
        async getPrice(symbol: string): Promise<TokenPrice | null> {
          return {
            symbol,
            priceUsd: 42,
            source: 'oracle',
            timestamp: Date.now(),
          };
        },
        async getPrices(symbols: string[]): Promise<Record<string, TokenPrice>> {
          const result: Record<string, TokenPrice> = {};
          for (const symbol of symbols) {
            result[symbol] = {
              symbol,
              priceUsd: 42,
              source: 'oracle',
              timestamp: Date.now(),
            };
          }
          return result;
        },
      };

      const price = await customProvider.getPrice('CUSTOM');
      expect(price?.priceUsd).toBe(42);
      expect(price?.source).toBe('oracle');
    });

    it('should support price subscription (optional)', () => {
      let callCount = 0;

      const subscribeProvider: PriceProvider = {
        async getPrice() { return null; },
        async getPrices() { return {}; },
        subscribe(symbols, callback) {
          callCount++;
          // Simulate price update
          const prices: Record<string, TokenPrice> = {};
          for (const symbol of symbols) {
            prices[symbol] = {
              symbol,
              priceUsd: 100,
              source: 'api',
              timestamp: Date.now(),
            };
          }
          callback(prices);
          return () => { /* unsubscribe */ };
        },
      };

      const unsubscribe = subscribeProvider.subscribe?.(['ETH', 'BTC'], () => {});
      expect(callCount).toBe(1);
      unsubscribe?.();
    });
  });

  describe('TokenAsset', () => {
    it('should support Move chain assets', () => {
      const asset: TokenAsset = {
        chainId: 'nasun-devnet',
        chainName: 'Nasun Devnet',
        chainType: 'move',
        symbol: 'NSN',
        name: 'Nasun',
        balance: 1000000000n,
        formattedBalance: '1.0',
        decimals: 9,
        type: '0x2::sui::SUI',
        priceUsd: 0.1,
        valueUsd: 0.1,
        change24h: 5.5,
      };

      expect(asset.chainType).toBe('move');
      expect(asset.type).toBeDefined();
    });

    it('should support EVM chain assets', () => {
      const asset: TokenAsset = {
        chainId: 'ethereum',
        chainName: 'Ethereum',
        chainType: 'evm',
        symbol: 'ETH',
        name: 'Ether',
        balance: 1000000000000000000n,
        formattedBalance: '1.0',
        decimals: 18,
        priceUsd: 3400,
        valueUsd: 3400,
        change24h: -2.3,
      };

      expect(asset.chainType).toBe('evm');
      expect(asset.balance).toBe(1000000000000000000n);
    });

    it('should handle ERC-20 assets with contract address', () => {
      const asset: TokenAsset = {
        chainId: 'ethereum',
        chainName: 'Ethereum',
        chainType: 'evm',
        symbol: 'USDC',
        name: 'USD Coin',
        balance: 1000000n, // 1 USDC (6 decimals)
        formattedBalance: '1.0',
        decimals: 6,
        type: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        priceUsd: 1.0,
        valueUsd: 1.0,
      };

      expect(asset.type).toMatch(/^0x/);
      expect(asset.decimals).toBe(6);
    });
  });
});
