/**
 * Portfolio Types
 *
 * Types for multi-chain asset tracking and portfolio management.
 */

import type { ChainType } from '../config/chains';

// ============================================
// Price Types
// ============================================

/** Price data for a token */
export interface TokenPrice {
  /** Token symbol */
  symbol: string;
  /** Price in USD */
  priceUsd: number;
  /** 24-hour price change percentage */
  change24h?: number;
  /** Price source */
  source: 'oracle' | 'api' | 'simulated';
  /** Timestamp when price was fetched */
  timestamp: number;
}

/** Price provider interface for fetching token prices */
export interface PriceProvider {
  /** Get price for a single token */
  getPrice(symbol: string): Promise<TokenPrice | null>;
  /** Get prices for multiple tokens */
  getPrices(symbols: string[]): Promise<Record<string, TokenPrice>>;
  /** Subscribe to price updates (optional) */
  subscribe?(
    symbols: string[],
    callback: (prices: Record<string, TokenPrice>) => void
  ): () => void;
}

// ============================================
// Asset Types
// ============================================

/** Token balance with USD value */
export interface TokenAsset {
  /** Chain identifier */
  chainId: string;
  /** Chain display name */
  chainName: string;
  /** Chain type (move or evm) */
  chainType: ChainType;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Balance in minimum units */
  balance: bigint;
  /** Formatted balance (display units) */
  formattedBalance: string;
  /** Token decimals */
  decimals: number;
  /** Token type (coin type for Move, contract address for EVM) */
  type?: string;
  /** Price in USD */
  priceUsd: number;
  /** Total value in USD */
  valueUsd: number;
  /** 24-hour price change percentage */
  change24h?: number;
}

/** Per-chain portfolio breakdown */
export interface ChainPortfolio {
  /** Chain identifier */
  chainId: string;
  /** Chain display name */
  chainName: string;
  /** Chain type */
  chainType: ChainType;
  /** Total value in USD */
  totalValueUsd: number;
  /** Assets on this chain */
  assets: TokenAsset[];
}

/** Aggregated portfolio data */
export interface PortfolioSummary {
  /** Total portfolio value in USD */
  totalValueUsd: number;
  /** 24-hour value change in USD */
  change24hUsd: number;
  /** 24-hour value change percentage */
  change24hPercent: number;
  /** All assets across chains */
  assets: TokenAsset[];
  /** Assets grouped by chain */
  byChain: ChainPortfolio[];
  /** Last update timestamp */
  lastUpdated: number;
}

// ============================================
// Configuration Types
// ============================================

/** ERC-20 token configuration */
export interface ERC20TokenConfig {
  /** Contract address */
  address: `0x${string}`;
  /** Token symbol */
  symbol: string;
  /** Token name */
  name: string;
  /** Token decimals */
  decimals: number;
}

/** Portfolio configuration */
export interface PortfolioConfig {
  /** Price provider implementation */
  priceProvider?: PriceProvider;
  /** Include testnet chains (default: true) */
  includeTestnets?: boolean;
  /** Enabled chain IDs (default: all chains) */
  enabledChains?: string[];
  /** ERC-20 tokens to track per chain (chainId -> tokens) */
  erc20Tokens?: Record<string, ERC20TokenConfig[]>;
  /** Price cache TTL in milliseconds (default: 30000) */
  priceCacheTtlMs?: number;
}

// ============================================
// Hook Result Types
// ============================================

/** usePortfolio hook options */
export interface UsePortfolioOptions {
  /** EVM address for EVM chains (optional, uses wallet address if not provided) */
  evmAddress?: string;
  /** Polling interval in milliseconds (default: 30000) */
  pollingInterval?: number;
  /** Enable/disable the hook */
  enabled?: boolean;
}

/** usePortfolio hook result */
export interface UsePortfolioResult {
  /** Portfolio data */
  data: PortfolioSummary | undefined;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch data */
  refetch: () => void;
}
