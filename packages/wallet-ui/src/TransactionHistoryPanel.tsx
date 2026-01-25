/**
 * TransactionHistoryPanel Component
 * Displays transaction history with token transfers
 */

import { useState } from 'react';
import {
  useTransactionHistory,
  shortenAddress,
  type TransactionHistoryItem,
  type TokenTransfer,
} from '@nasun/wallet';

interface TransactionHistoryPanelProps {
  /** Maximum number of transactions to show initially */
  limit?: number;
  /** Custom empty state message */
  emptyMessage?: string;
  /** Hide header */
  hideHeader?: boolean;
  /** Custom class name */
  className?: string;
  /** Auto-refresh interval in milliseconds (default: 30000) */
  refetchInterval?: number;
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 min ago' : `${minutes} mins ago`;
  }
  return 'Just now';
}

/**
 * Format amount for compact display (max 8 chars)
 */
function formatCompactAmount(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;

  // For very small numbers, show up to 5 decimal places
  if (Math.abs(num) < 0.001) {
    return num.toFixed(5);
  }
  // For small numbers, show up to 4 decimal places
  if (Math.abs(num) < 1) {
    return num.toFixed(4);
  }
  // For medium numbers, show up to 2 decimal places
  if (Math.abs(num) < 1000) {
    return num.toFixed(2);
  }
  // For large numbers, use K/M notation
  if (Math.abs(num) >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M';
  }
  if (Math.abs(num) >= 1000) {
    return (num / 1000).toFixed(2) + 'K';
  }
  return amount;
}

/**
 * Single transfer item display
 */
function TransferItem({ transfer }: { transfer: TokenTransfer }) {
  const isIn = transfer.direction === 'in';
  const symbol = transfer.symbol || 'Token';
  const compactAmount = formatCompactAmount(transfer.amount);

  return (
    <span
      className={`inline-flex items-center gap-1 ${
        isIn ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      }`}
      title={`${transfer.amount} ${symbol}`}
    >
      <span>{isIn ? '+' : '-'}</span>
      <span className="font-medium">{compactAmount}</span>
      <span className="text-gray-600 dark:text-zinc-400">{symbol}</span>
    </span>
  );
}

/**
 * Single transaction item
 */
function TransactionItem({
  tx,
  onClick,
}: {
  tx: TransactionHistoryItem;
  onClick?: (digest: string) => void;
}) {
  const isIn = tx.direction === 'in';
  const hasTransfers = tx.transfers.length > 0;
  const isContractCall = !hasTransfers && tx.status === 'success';

  // Get primary counterparty
  const counterparty = tx.counterparties[0];

  // Determine display label
  const getLabel = () => {
    if (hasTransfers) {
      return isIn ? 'Received' : 'Sent';
    }
    return 'Executed';
  };

  // Determine icon style
  const getIconStyle = () => {
    if (isContractCall) {
      return 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400';
    }
    if (isIn) {
      return 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400';
    }
    return 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400';
  };

  return (
    <button
      onClick={() => onClick?.(tx.digest)}
      className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors border-b border-gray-100 dark:border-zinc-700 last:border-b-0"
    >
      <div className="flex items-start gap-2">
        {/* Direction icon and label */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${getIconStyle()}`}
          >
            {isContractCall ? (
              // Code/terminal icon for contract calls
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            ) : isIn ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
              {getLabel()}
            </p>
            {counterparty && hasTransfers && (
              <p className="text-xs text-gray-500 dark:text-zinc-400 truncate max-w-[120px]">
                {isIn ? 'From: ' : 'To: '}
                <span className="font-mono">{shortenAddress(counterparty, 4)}</span>
              </p>
            )}
          </div>
        </div>

        {/* Amount and time */}
        <div className="text-right flex-shrink-0">
          {hasTransfers ? (
            <div className="space-y-0.5 whitespace-nowrap">
              {tx.transfers.slice(0, 2).map((transfer, i) => (
                <div key={i} className="text-sm">
                  <TransferItem transfer={transfer} />
                </div>
              ))}
              {tx.transfers.length > 2 && (
                <p className="text-xs text-gray-400 dark:text-zinc-500">
                  +{tx.transfers.length - 2} more
                </p>
              )}
            </div>
          ) : (
            <div className="text-right">
              <p className="text-sm md:text-base text-gray-500 dark:text-zinc-400">
                {tx.status === 'failure' ? 'Failed' : 'Contract Call'}
              </p>
              {tx.gasUsed && tx.status === 'success' && (
                <p className="text-xs text-gray-400 dark:text-zinc-500">
                  Gas: {formatCompactAmount((Number(tx.gasUsed) / 1e9).toString())}
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
            {formatRelativeTime(tx.timestamp)}
          </p>
        </div>
      </div>

      {/* Error message for failed transactions */}
      {tx.status === 'failure' && tx.error && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-400 truncate">{tx.error}</p>
      )}
    </button>
  );
}

export function TransactionHistoryPanel({
  limit = 10,
  emptyMessage = 'No transactions yet',
  hideHeader = false,
  className = '',
  refetchInterval = 30000,
}: TransactionHistoryPanelProps) {
  const { data: transactions, isLoading, error, hasNextPage, refetch } = useTransactionHistory({
    limit,
    refetchInterval,
  });
  const [expanded, setExpanded] = useState(false);

  // Handle transaction click - open in explorer
  const handleTxClick = (digest: string) => {
    // Get explorer URL from wallet config
    const explorerUrl = 'https://explorer.devnet.nasun.io';
    window.open(`${explorerUrl}/tx/${digest}`, '_blank');
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`bg-white dark:bg-zinc-800 rounded-md ${className}`}>
        {!hideHeader && (
          <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-zinc-700">
            <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
              Transaction History
            </h3>
          </div>
        )}
        <div className="p-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-100 dark:bg-zinc-700 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 dark:bg-zinc-700 rounded w-1/3" />
                <div className="h-3 bg-gray-100 dark:bg-zinc-700 rounded w-1/4" />
              </div>
              <div className="h-4 bg-gray-100 dark:bg-zinc-700 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`bg-white dark:bg-zinc-800 rounded-md ${className}`}>
        {!hideHeader && (
          <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-zinc-700">
            <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
              Transaction History
            </h3>
          </div>
        )}
        <div className="p-4">
          <div className="bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-md p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={() => refetch()}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (transactions.length === 0) {
    return (
      <div className={`bg-white dark:bg-zinc-800 rounded-md ${className}`}>
        {!hideHeader && (
          <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-zinc-700">
            <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
              Transaction History
            </h3>
            <button
              onClick={() => refetch()}
              className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="p-6 text-center">
          <svg
            className="w-12 h-12 text-gray-400 dark:text-zinc-600 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="text-gray-500 dark:text-zinc-400 text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  // Display transactions
  const displayedTxs = expanded ? transactions : transactions.slice(0, 5);

  return (
    <div className={`bg-white dark:bg-zinc-800 rounded-md ${className}`}>
      {!hideHeader && (
        <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-zinc-700">
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
            Transaction History
          </h3>
          <button
            onClick={() => refetch()}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Refresh"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Transaction list */}
      <div className="divide-y divide-gray-100 dark:divide-zinc-700">
        {displayedTxs.map((tx) => (
          <TransactionItem key={tx.digest} tx={tx} onClick={handleTxClick} />
        ))}
      </div>

      {/* Show more / less */}
      {transactions.length > 5 && (
        <div className="p-2 border-t border-gray-100 dark:border-zinc-700">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            {expanded ? 'Show less' : `Show ${transactions.length - 5} more`}
          </button>
        </div>
      )}

      {/* Load more indicator */}
      {hasNextPage && expanded && (
        <p className="text-center text-xs text-gray-400 dark:text-zinc-500 py-2">
          More transactions available in Explorer
        </p>
      )}
    </div>
  );
}
