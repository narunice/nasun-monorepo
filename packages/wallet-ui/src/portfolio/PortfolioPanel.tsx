/**
 * Portfolio Panel Component
 * Displays multi-chain asset summary with USD valuation
 */

import { usePortfolio, useWallet, useRefreshPortfolio, useZkLogin } from '@nasun/wallet';
import type { TokenAsset, ChainPortfolio } from '@nasun/wallet';
import { PanelHeader } from '../shared';

export interface PortfolioPanelProps {
  className?: string;
  showChainBreakdown?: boolean;
  compact?: boolean;
  onClose?: () => void;
}

/**
 * Format USD value with appropriate precision
 */
function formatUsd(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  if (value > 0) {
    return `$${value.toFixed(4)}`;
  }
  return '$0.00';
}

/**
 * Format percentage change
 */
function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Chain icon component
 */
function ChainIcon({ chainType, size = 16 }: { chainType: 'move' | 'evm'; size?: number }) {
  if (chainType === 'move') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-blue-500">
        <circle cx="12" cy="12" r="10" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-purple-500">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

/**
 * Asset row component
 */
function AssetRow({ asset }: { asset: TokenAsset }) {
  const changeColor = (asset.change24h ?? 0) >= 0 ? 'text-green-500' : 'text-red-500';

  return (
    <div className="flex items-center justify-between py-2 px-1 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <ChainIcon chainType={asset.chainType} size={14} />
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white truncate">
            {asset.symbol}
          </p>
          <small className="text-gray-500 dark:text-zinc-400 truncate block">
            {asset.chainName}
          </small>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-medium text-gray-900 dark:text-white">
          {formatUsd(asset.valueUsd)}
        </p>
        <small className="text-gray-500 dark:text-zinc-400 block">
          {asset.formattedBalance} {asset.symbol}
        </small>
        {asset.change24h !== undefined && (
          <small className={`${changeColor} block`}>
            {formatPercent(asset.change24h)}
          </small>
        )}
      </div>
    </div>
  );
}

/**
 * Chain breakdown section
 */
function ChainBreakdown({ chains }: { chains: ChainPortfolio[] }) {
  if (chains.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-zinc-700">
      <h4 className="font-medium text-gray-500 dark:text-zinc-400 mb-2">
        By Chain
      </h4>
      <div className="space-y-1">
        {chains.map((chain) => (
          <div
            key={chain.chainId}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <ChainIcon chainType={chain.chainType} size={12} />
              <span className="text-gray-700 dark:text-zinc-300">{chain.chainName}</span>
            </div>
            <span className="font-medium text-gray-900 dark:text-white">
              {formatUsd(chain.totalValueUsd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PortfolioPanel({
  className = '',
  showChainBreakdown = true,
  compact = false,
  onClose,
}: PortfolioPanelProps) {
  const { status } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const { data: portfolio, isLoading, error } = usePortfolio();
  const refreshPortfolio = useRefreshPortfolio();

  // Not connected - check both wallet and zkLogin
  const isConnected = status === 'unlocked' || isZkLoggedIn;
  if (!isConnected) {
    return (
      <div className={`text-center py-6 ${className}`}>
        <p className="text-gray-500 dark:text-zinc-400">
          Connect wallet to view portfolio
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading && !portfolio) {
    return (
      <div className={`${className}`}>
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-gray-200 dark:bg-zinc-700 rounded w-1/2" />
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/3" />
          <div className="space-y-2 mt-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 dark:bg-zinc-700 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`text-center py-6 ${className}`}>
        <p className="text-red-400 mb-2">Failed to load portfolio</p>
        <button
          onClick={() => refreshPortfolio()}
          className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (!portfolio || portfolio.assets.length === 0) {
    return (
      <div className={`text-center py-6 ${className}`}>
        <svg
          className="w-10 h-10 text-gray-400 dark:text-zinc-600 mx-auto mb-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-gray-500 dark:text-zinc-400">No assets found</p>
      </div>
    );
  }

  const changeColor = portfolio.change24hPercent >= 0 ? 'text-green-500' : 'text-red-500';
  const changeSign = portfolio.change24hUsd >= 0 ? '+' : '';

  // Compact mode
  if (compact) {
    return (
      <div className={`flex items-center justify-between ${className}`}>
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white">
            {formatUsd(portfolio.totalValueUsd)}
          </h3>
          <small className={changeColor}>
            {changeSign}{formatUsd(Math.abs(portfolio.change24hUsd))} ({formatPercent(portfolio.change24hPercent)})
          </small>
        </div>
        <button
          onClick={() => refreshPortfolio()}
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
          title="Refresh"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>
    );
  }

  // Full mode
  return (
    <div className={`p-4 w-full ${className}`}>
      <PanelHeader title="Portfolio" onClose={onClose} />
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">
              {formatUsd(portfolio.totalValueUsd)}
            </h2>
            <p className={changeColor}>
              {changeSign}{formatUsd(Math.abs(portfolio.change24hUsd))} ({formatPercent(portfolio.change24hPercent)}) 24h
            </p>
          </div>
          <button
            onClick={() => refreshPortfolio()}
            className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
            title="Refresh portfolio"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Asset list */}
      <div className="space-y-1">
        <h4 className="font-medium text-gray-500 dark:text-zinc-400 mb-2">
          Assets ({portfolio.assets.length})
        </h4>
        {portfolio.assets
          .sort((a, b) => b.valueUsd - a.valueUsd)
          .map((asset, index) => (
            <AssetRow key={`${asset.chainId}-${asset.symbol}-${index}`} asset={asset} />
          ))}
      </div>

      {/* Chain breakdown */}
      {showChainBreakdown && <ChainBreakdown chains={portfolio.byChain} />}

      {/* Last updated */}
      <small className="text-gray-400 dark:text-zinc-500 mt-4 text-center block">
        Last updated: {new Date(portfolio.lastUpdated).toLocaleString('en-US')}
      </small>
    </div>
  );
}
