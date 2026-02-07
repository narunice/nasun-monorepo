/**
 * TradeHistory Component
 * Personal trade fills (1 fill = 1 row) with Role (Maker/Taker)
 * Used in BottomTabPanel "Trade History" tab
 */

import { useState } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { useMarket } from "../context/MarketContext";
import { useMyTrades } from "../hooks/useMyTrades";
import { useOrderActions } from "../hooks";
import { SkeletonTable } from '@/components/common';

// Re-export Trade type for external consumers (useTradeEvents compatibility)
export type { Trade } from '../types/trade';

interface TradeHistoryProps {
  className?: string;
}

const PAGE_SIZE = 10;

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return formatTime(timestamp);
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }) + ' ' + formatTime(timestamp);
}

export function TradeHistory({ className = "" }: TradeHistoryProps) {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;

  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;
  const quoteSymbol = currentPool.quoteToken.symbol;

  const { balanceManagerId } = useOrderActions();
  const { data: trades, isLoading } = useMyTrades(balanceManagerId);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (!isConnected) {
    return (
      <div className={`text-center text-theme-text-muted py-6 ${className}`}>
        <p className="text-trading-sm xl:text-trading-lg">Connect wallet to view trade history</p>
      </div>
    );
  }

  if (!balanceManagerId) {
    return (
      <div className={`text-center text-theme-text-muted py-6 ${className}`}>
        <p className="text-trading-sm xl:text-trading-lg">Enable Pado to view trade history</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`py-4 px-2 ${className}`}>
        <SkeletonTable rows={5} cols={5} />
      </div>
    );
  }

  if (!trades || trades.length === 0) {
    return (
      <div className={`text-center text-theme-text-muted py-6 ${className}`}>
        <p className="text-trading-sm xl:text-trading-lg">No trades yet</p>
        <p className="text-[10px] xl:text-trading-xs mt-1">Your fills will appear here</p>
      </div>
    );
  }

  const visibleTrades = trades.slice(0, visibleCount);
  const remainingCount = trades.length - visibleCount;
  const canShowMore = remainingCount > 0;
  const canShowLess = visibleCount > PAGE_SIZE;

  return (
    <div className={className}>
      <table className="w-full text-xs xl:text-sm">
        <thead className="text-theme-text-secondary">
          <tr>
            <th className="py-2 px-2 text-left font-medium">Side</th>
            <th className="py-2 px-2 text-right font-medium">Price ({quoteSymbol})</th>
            <th className="py-2 px-2 text-right font-medium">Amount ({baseSymbol})</th>
            <th className="py-2 px-2 text-center font-medium">Role</th>
            <th className="py-2 px-2 text-right font-medium">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-theme-border">
          {visibleTrades.map((trade) => (
            <tr key={trade.id} className="hover:bg-theme-bg-tertiary/30 transition-colors">
              <td className={`py-1.5 px-2 font-semibold ${
                trade.isBid
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {trade.isBid ? 'BUY' : 'SELL'}
              </td>
              <td className="py-1.5 px-2 text-right font-mono text-theme-text-primary">
                ${trade.price.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="py-1.5 px-2 text-right font-mono text-theme-text-primary">
                {trade.quantity.toFixed(5)}
              </td>
              <td className="py-1.5 px-2 text-center">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] xl:text-xs font-medium ${
                  trade.role === 'taker'
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'bg-gray-600/20 text-gray-400'
                }`}>
                  {trade.role === 'taker' ? 'Taker' : 'Maker'}
                </span>
              </td>
              <td className="py-1.5 px-2 text-right text-theme-text-muted">
                {formatDate(trade.timestamp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(canShowMore || canShowLess) && (
        <div className="flex justify-center gap-3 pt-2">
          {canShowMore && (
            <button
              onClick={() => setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, trades.length))}
              className="text-xs xl:text-sm text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              Show {Math.min(PAGE_SIZE, remainingCount)} more
            </button>
          )}
          {canShowLess && (
            <button
              onClick={() => setVisibleCount(PAGE_SIZE)}
              className="text-xs xl:text-sm text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              Collapse
            </button>
          )}
        </div>
      )}
    </div>
  );
}
