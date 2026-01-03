/**
 * RecentTrades Component
 * Display user's recent trading history with Load More pagination
 */

import { useState } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { useTradeHistory, type UserTrade } from '../hooks/useTradeHistory';

const ITEMS_PER_PAGE = 10;

interface TradeRowProps {
  trade: UserTrade;
}

function TradeRow({ trade }: TradeRowProps) {
  const isBuy = trade.side === 'buy';
  const sideColor = isBuy
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
  const sideBg = isBuy
    ? 'bg-green-100 dark:bg-green-900/30'
    : 'bg-red-100 dark:bg-red-900/30';

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) {
      return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${price.toFixed(4)}`;
  };

  const formatQuantity = (qty: number) => {
    if (qty < 0.0001) return qty.toExponential(2);
    if (qty < 1) return qty.toFixed(6);
    return qty.toFixed(4);
  };

  return (
    <tr className="hover:bg-theme-bg-tertiary/30 transition-colors">
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${sideBg} ${sideColor}`}>
            {trade.side.toUpperCase()}
          </span>
          <span className="text-sm font-medium">{trade.poolName}</span>
        </div>
      </td>
      <td className="py-2.5 px-3 text-right font-mono text-sm">
        {formatPrice(trade.price)}
      </td>
      <td className="py-2.5 px-3 text-right font-mono text-sm">
        {formatQuantity(trade.quantity)}
      </td>
      <td className="py-2.5 px-3 text-right font-mono text-sm">
        ${trade.total.toFixed(2)}
      </td>
      <td className="py-2.5 px-3 text-right text-xs text-theme-text-muted">
        {formatTime(trade.timestamp)}
      </td>
    </tr>
  );
}

interface RecentTradesProps {
  /** When true, renders without container (for use in ActivityTabs) */
  embedded?: boolean;
}

export function RecentTrades({ embedded = false }: RecentTradesProps) {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { trades, isLoading, error, refetch } = useTradeHistory();
  const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);

  const isConnected = status === 'unlocked' || isZkConnected;
  const displayedTrades = trades.slice(0, displayCount);
  const hasMore = displayCount < trades.length;
  const remaining = trades.length - displayCount;

  const handleLoadMore = () => {
    setDisplayCount((prev) => Math.min(prev + ITEMS_PER_PAGE, trades.length));
  };

  // Embedded mode: simplified rendering without container
  if (embedded) {
    if (!isConnected) {
      return (
        <div className="p-8 text-center text-theme-text-muted">
          Connect wallet to view your trade history
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="p-8 text-center text-theme-text-muted">
          Loading...
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-8 text-center">
          <div className="text-red-600 dark:text-red-400 mb-2">{error}</div>
          <button
            onClick={refetch}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }

    if (trades.length === 0) {
      return (
        <div className="p-8 text-center text-theme-text-muted">
          No trades yet. Start trading to see your history here.
        </div>
      );
    }

    return (
      <>
        <div className="px-4 py-2 text-xs text-theme-text-muted text-right">
          {displayedTrades.length} of {trades.length} trades
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-theme-text-secondary bg-theme-bg-tertiary/50">
              <tr>
                <th className="py-2 px-3 text-left font-medium">Side / Market</th>
                <th className="py-2 px-3 text-right font-medium">Price</th>
                <th className="py-2 px-3 text-right font-medium">Amount</th>
                <th className="py-2 px-3 text-right font-medium">Total</th>
                <th className="py-2 px-3 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border">
              {displayedTrades.map((trade) => (
                <TradeRow key={trade.id} trade={trade} />
              ))}
            </tbody>
          </table>
        </div>

        {hasMore && (
          <div className="p-4 border-t border-theme-border">
            <button
              onClick={handleLoadMore}
              className="w-full py-2 px-4 text-sm font-medium text-blue-600 dark:text-blue-400
                         bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30
                         rounded-lg transition-colors"
            >
              Load More ({remaining} more)
            </button>
          </div>
        )}
      </>
    );
  }

  // Standalone mode: full container with header
  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg">
        <div className="px-4 py-3 border-b border-theme-border flex justify-between items-center">
          <h2 className="font-semibold">Trade History</h2>
        </div>
        <div className="p-8 text-center text-theme-text-muted">
          Connect wallet to view your trade history
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg">
        <div className="px-4 py-3 border-b border-theme-border">
          <h2 className="font-semibold">Trade History</h2>
        </div>
        <div className="p-8 text-center text-theme-text-muted">
          Loading...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg">
        <div className="px-4 py-3 border-b border-theme-border flex justify-between items-center">
          <h2 className="font-semibold">Trade History</h2>
          <button
            onClick={refetch}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Retry
          </button>
        </div>
        <div className="p-8 text-center text-red-600 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg">
        <div className="px-4 py-3 border-b border-theme-border">
          <h2 className="font-semibold">Trade History</h2>
        </div>
        <div className="p-8 text-center text-theme-text-muted">
          No trades yet. Start trading to see your history here.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-theme-border flex justify-between items-center">
        <h2 className="font-semibold">Trade History</h2>
        <span className="text-xs text-theme-text-muted">
          {displayedTrades.length} of {trades.length} trades
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-theme-text-secondary bg-theme-bg-tertiary/50">
            <tr>
              <th className="py-2 px-3 text-left font-medium">Side / Market</th>
              <th className="py-2 px-3 text-right font-medium">Price</th>
              <th className="py-2 px-3 text-right font-medium">Amount</th>
              <th className="py-2 px-3 text-right font-medium">Total</th>
              <th className="py-2 px-3 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-border">
            {displayedTrades.map((trade) => (
              <TradeRow key={trade.id} trade={trade} />
            ))}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="p-4 border-t border-theme-border">
          <button
            onClick={handleLoadMore}
            className="w-full py-2 px-4 text-sm font-medium text-blue-600 dark:text-blue-400
                       bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30
                       rounded-lg transition-colors"
          >
            Load More ({remaining} more)
          </button>
        </div>
      )}
    </div>
  );
}
