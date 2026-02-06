/**
 * OrderHistory Component
 * Displays personal order history (limit + market orders with lifecycle status)
 */

import { useState } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { useMarket } from '../context/MarketContext';
import { useOrderActions } from '../hooks';
import { useOrderHistory } from '../hooks/useOrderHistory';

const PAGE_SIZE = 10;

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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

export function OrderHistory() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn;

  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;
  const quoteSymbol = currentPool.quoteToken.symbol;

  const { balanceManagerId } = useOrderActions();
  const { data: orders, isLoading } = useOrderHistory(balanceManagerId);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (!isConnected) {
    return (
      <div className="text-center text-theme-text-muted py-6">
        <p className="text-trading-sm xl:text-trading-lg">Connect wallet to view order history</p>
      </div>
    );
  }

  if (!balanceManagerId) {
    return (
      <div className="text-center text-theme-text-muted py-6">
        <p className="text-trading-sm xl:text-trading-lg">Enable Pado to view order history</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center text-theme-text-muted py-6">
        <p className="text-trading-sm xl:text-trading-lg">Loading...</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center text-theme-text-muted py-6">
        <p className="text-trading-sm xl:text-trading-lg">No order history</p>
      </div>
    );
  }

  const visibleOrders = orders.slice(0, visibleCount);
  const remainingCount = orders.length - visibleCount;
  const canShowMore = remainingCount > 0;
  const canShowLess = visibleCount > PAGE_SIZE;

  return (
    <div>
      <table className="w-full text-xs xl:text-sm">
        <thead className="text-theme-text-secondary">
          <tr>
            <th className="py-2 px-2 text-left font-medium">Type</th>
            <th className="py-2 px-2 text-left font-medium">Side</th>
            <th className="py-2 px-2 text-right font-medium">Price ({quoteSymbol})</th>
            <th className="py-2 px-2 text-right font-medium">Amount ({baseSymbol})</th>
            <th className="py-2 px-2 text-center font-medium">Status</th>
            <th className="py-2 px-2 text-right font-medium">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-theme-border">
          {visibleOrders.map((order) => (
            <tr key={order.orderId + order.txDigest} className="hover:bg-theme-bg-tertiary/30 transition-colors">
              <td className="py-1.5 px-2 text-theme-text-secondary">
                {order.type === 'limit' ? 'Limit' : 'Market'}
              </td>
              <td className={`py-1.5 px-2 font-semibold ${
                order.isBid
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {order.isBid ? 'BUY' : 'SELL'}
              </td>
              <td className="py-1.5 px-2 text-right font-mono text-theme-text-primary">
                ${order.price.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="py-1.5 px-2 text-right font-mono text-theme-text-primary">
                {order.quantity.toFixed(5)}
              </td>
              <td className="py-1.5 px-2 text-center">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] xl:text-xs font-medium ${
                  order.status === 'filled'
                    ? 'bg-green-600/20 text-green-400'
                    : 'bg-gray-600/20 text-gray-400'
                }`}>
                  {order.status === 'filled' ? 'Filled' : 'Canceled'}
                </span>
              </td>
              <td className="py-1.5 px-2 text-right text-theme-text-muted">
                {formatDate(order.timestamp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(canShowMore || canShowLess) && (
        <div className="flex justify-center gap-3 pt-2">
          {canShowMore && (
            <button
              onClick={() => setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, orders.length))}
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
