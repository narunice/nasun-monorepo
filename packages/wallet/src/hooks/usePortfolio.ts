/**
 * Portfolio Hook
 *
 * Aggregates balances across all chains with USD valuation.
 * TanStack Query based multi-chain portfolio management.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { useWallet } from './useWallet';
import { useZkLoginStore } from '../stores/zkLoginStore';
import { getAllBalances } from '../sui/client';
import { getAllChains, getEVMChains, getMoveChains, type ChainConfig } from '../config/chains';
import { getEVMClient } from '../core/evm/client';
import { getERC20Balances } from '../core/evm/erc20';
import { DefaultPriceProvider } from '../core/portfolio/price-provider';
import type {
  PortfolioConfig,
  PortfolioSummary,
  TokenAsset,
  ChainPortfolio,
  PriceProvider,
  UsePortfolioOptions,
  UsePortfolioResult,
} from '../types/portfolio';

// Query keys
const PORTFOLIO_QUERY_KEY = 'wallet-portfolio';

// Default polling interval (30 seconds)
const DEFAULT_POLLING_INTERVAL = 30_000;

// Global configuration
let portfolioConfig: PortfolioConfig = {};
let priceProvider: PriceProvider = new DefaultPriceProvider();

/**
 * Configure portfolio settings
 * Call this at app initialization to customize behavior.
 *
 * @example
 * ```ts
 * configurePortfolio({
 *   priceProvider: new DefaultPriceProvider({ cacheTtlMs: 60000 }),
 *   includeTestnets: false,
 *   enabledChains: ['nasun-devnet', 'ethereum', 'base'],
 * });
 * ```
 */
export function configurePortfolio(config: PortfolioConfig): void {
  portfolioConfig = { ...portfolioConfig, ...config };
  if (config.priceProvider) {
    priceProvider = config.priceProvider;
  }
}

/**
 * Get current portfolio configuration
 */
export function getPortfolioConfig(): PortfolioConfig {
  return { ...portfolioConfig };
}

/**
 * Portfolio hook - aggregates balances across all chains with USD valuation.
 *
 * @param options Hook options
 * @returns Portfolio data with loading/error states
 *
 * @example
 * ```tsx
 * const { data: portfolio, isLoading, error, refetch } = usePortfolio({
 *   evmAddress: '0x...',
 *   pollingInterval: 60000,
 * });
 *
 * if (portfolio) {
 *   console.log('Total value:', portfolio.totalValueUsd);
 *   console.log('24h change:', portfolio.change24hPercent, '%');
 * }
 * ```
 */
export function usePortfolio(options?: UsePortfolioOptions): UsePortfolioResult {
  const { account, status } = useWallet();
  const { state: zkState, isConnected: isZkLoggedIn } = useZkLoginStore();

  // Move address (Nasun/Sui)
  const moveAddress = account?.address ?? zkState?.address;
  // EVM address (from options or derived - future: derive from same mnemonic)
  const evmAddress = options?.evmAddress;

  const isWalletConnected = status === 'unlocked' || isZkLoggedIn;
  const isEnabled = options?.enabled !== false && isWalletConnected && !!moveAddress;

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery<PortfolioSummary>({
    queryKey: [PORTFOLIO_QUERY_KEY, moveAddress, evmAddress],
    queryFn: async (): Promise<PortfolioSummary> => {
      const assets: TokenAsset[] = [];
      const allChains = getAllChains();
      const enabledChains = portfolioConfig.enabledChains ?? allChains.map((c) => c.id);
      const includeTestnets = portfolioConfig.includeTestnets ?? true;

      // Collect all symbols for batch price fetching
      const symbolsToFetch = new Set<string>();

      // 1. Fetch Move chain balances (Nasun)
      const moveChains = getMoveChains().filter(
        (c) => enabledChains.includes(c.id) && !c.disabled && (includeTestnets || !c.testnet)
      );

      for (const chain of moveChains) {
        if (!moveAddress) continue;

        try {
          const balances = await getAllBalances(moveAddress);

          // Native token
          symbolsToFetch.add(balances.native.symbol);
          assets.push({
            chainId: chain.id,
            chainName: chain.name,
            chainType: 'move',
            symbol: balances.native.symbol,
            name: chain.nativeCurrency.name,
            balance: balances.native.balance,
            formattedBalance: balances.native.formatted,
            decimals: balances.native.decimals,
            type: balances.native.type,
            priceUsd: 0, // Will be filled after batch fetch
            valueUsd: 0,
          });

          // Additional tokens (NBTC, NUSDC)
          for (const [symbol, tokenBalance] of Object.entries(balances.tokens)) {
            symbolsToFetch.add(symbol);
            assets.push({
              chainId: chain.id,
              chainName: chain.name,
              chainType: 'move',
              symbol,
              name: symbol,
              balance: tokenBalance.balance,
              formattedBalance: tokenBalance.formatted,
              decimals: tokenBalance.decimals,
              type: tokenBalance.type,
              priceUsd: 0,
              valueUsd: 0,
            });
          }
        } catch (err) {
          console.warn(`[usePortfolio] Failed to fetch ${chain.name} balances:`, err);
        }
      }

      // 2. Fetch EVM chain balances
      if (evmAddress) {
        const evmChains = getEVMChains().filter(
          (c) => enabledChains.includes(c.id) && !c.disabled && (includeTestnets || !c.testnet)
        );

        for (const chain of evmChains) {
          await fetchEVMChainBalances(
            chain,
            evmAddress,
            assets,
            symbolsToFetch
          );
        }
      }

      // 3. Batch fetch all prices
      const prices = await priceProvider.getPrices(Array.from(symbolsToFetch));

      // 4. Apply prices to assets
      for (const asset of assets) {
        const price = prices[asset.symbol.toUpperCase()];
        if (price) {
          asset.priceUsd = price.priceUsd;
          asset.valueUsd = parseFloat(asset.formattedBalance) * price.priceUsd;
          asset.change24h = price.change24h;
        }
      }

      // 5. Calculate totals
      const totalValueUsd = assets.reduce((sum, a) => sum + a.valueUsd, 0);

      // Calculate 24h change (weighted average)
      let totalPreviousValue = 0;
      for (const asset of assets) {
        if (asset.change24h !== undefined && asset.valueUsd > 0) {
          const previousValue = asset.valueUsd / (1 + asset.change24h / 100);
          totalPreviousValue += previousValue;
        } else {
          totalPreviousValue += asset.valueUsd;
        }
      }
      const change24hUsd = totalValueUsd - totalPreviousValue;
      const change24hPercent =
        totalPreviousValue > 0 ? (change24hUsd / totalPreviousValue) * 100 : 0;

      // 6. Group by chain
      const chainMap = new Map<string, ChainPortfolio>();
      for (const asset of assets) {
        let chainPortfolio = chainMap.get(asset.chainId);
        if (!chainPortfolio) {
          chainPortfolio = {
            chainId: asset.chainId,
            chainName: asset.chainName,
            chainType: asset.chainType,
            totalValueUsd: 0,
            assets: [],
          };
          chainMap.set(asset.chainId, chainPortfolio);
        }
        chainPortfolio.assets.push(asset);
        chainPortfolio.totalValueUsd += asset.valueUsd;
      }

      return {
        totalValueUsd: Math.round(totalValueUsd * 100) / 100,
        change24hUsd: Math.round(change24hUsd * 100) / 100,
        change24hPercent: Math.round(change24hPercent * 100) / 100,
        assets,
        byChain: Array.from(chainMap.values()),
        lastUpdated: Date.now(),
      };
    },
    enabled: isEnabled,
    refetchInterval: options?.pollingInterval ?? DEFAULT_POLLING_INTERVAL,
    staleTime: 10_000,
  });

  return {
    data,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Helper to fetch EVM chain balances
 */
async function fetchEVMChainBalances(
  chain: ChainConfig,
  evmAddress: string,
  assets: TokenAsset[],
  symbolsToFetch: Set<string>
): Promise<void> {
  try {
    const client = getEVMClient(chain);

    // Native balance
    const nativeBalance = await client.getBalance({
      address: evmAddress as `0x${string}`,
    });
    const formattedNative = formatUnits(nativeBalance, chain.nativeCurrency.decimals);

    symbolsToFetch.add(chain.nativeCurrency.symbol);
    assets.push({
      chainId: chain.id,
      chainName: chain.name,
      chainType: 'evm',
      symbol: chain.nativeCurrency.symbol,
      name: chain.nativeCurrency.name,
      balance: nativeBalance,
      formattedBalance: formattedNative,
      decimals: chain.nativeCurrency.decimals,
      priceUsd: 0,
      valueUsd: 0,
    });

    // ERC-20 tokens
    const erc20Configs = portfolioConfig.erc20Tokens?.[chain.id] ?? [];
    if (erc20Configs.length > 0) {
      const erc20Balances = await getERC20Balances(
        client,
        erc20Configs,
        evmAddress as `0x${string}`
      );

      for (const erc20 of erc20Balances) {
        symbolsToFetch.add(erc20.symbol);
        assets.push({
          chainId: chain.id,
          chainName: chain.name,
          chainType: 'evm',
          symbol: erc20.symbol,
          name: erc20.name,
          balance: erc20.balance,
          formattedBalance: erc20.formattedBalance,
          decimals: erc20.decimals,
          type: erc20.address,
          priceUsd: 0,
          valueUsd: 0,
        });
      }
    }
  } catch (err) {
    console.warn(`[usePortfolio] Failed to fetch ${chain.name} balances:`, err);
  }
}

/**
 * Refresh portfolio data
 */
export function useRefreshPortfolio() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: [PORTFOLIO_QUERY_KEY] });
  };
}

/**
 * Get total portfolio value in USD
 */
export function usePortfolioTotalValue(options?: UsePortfolioOptions): number {
  const { data } = usePortfolio(options);
  return data?.totalValueUsd ?? 0;
}

/**
 * Get portfolio 24h change percentage
 */
export function usePortfolio24hChange(options?: UsePortfolioOptions): number {
  const { data } = usePortfolio(options);
  return data?.change24hPercent ?? 0;
}
