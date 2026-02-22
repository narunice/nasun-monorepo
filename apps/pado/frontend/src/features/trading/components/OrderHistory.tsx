/**
 * OrderHistory Component
 * Displays personal order history (limit + market orders with lifecycle status)
 */

import { useState, useMemo } from 'react';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useMarket } from '../context/MarketContext';
import { useOrderActions } from '../hooks';
import { useOrderHistory } from '../hooks/useOrderHistory';
import { SkeletonTable } from '@/components/common';

type SideFilter = 'all' | 'buy' | 'sell';
type PeriodFilter = 'all' | '24h' | '7d';

const PERIOD_MS: Record<PeriodFilter, number> = {
  all: 0,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

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
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isConnected = (status === 'unlocked' && account) || isZkLoggedIn || isPasskeyUnlocked;
  const senderAddress = isZkLoggedIn
    ? zkState?.address
    : account?.address ?? passkeyAddress ?? undefined;

  const { currentPool } = useMarket();
  const quoteSymbol = currentPool.quoteToken.symbol;

  const { balanceManagerId } = useOrderActions();
  const { data: orders, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useOrderHistory(balanceManagerId, senderAddress);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sideFilter, setSideFilter] = useState<SideFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');

  // Apply filters
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    let result = orders;
    if (sideFilter !== 'all') {
      result = result.filter(o => sideFilter === 'buy' ? o.isBid : !o.isBid);
    }
    if (periodFilter !== 'all') {
      const cutoff = Date.now() - PERIOD_MS[periodFilter];
      result = result.filter(o => o.timestamp >= cutoff);
    }
    return result;
  }, [orders, sideFilter, periodFilter]);

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
      <div className="py-4 px-2">
        <SkeletonTable rows={5} cols={6} />
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center text-theme-text-muted py-6">
        <p className="text-trading-sm xl:text-trading-lg">No orders yet</p>
        <p className="text-[10px] xl:text-trading-xs mt-1">Your order history will appear here</p>
      </div>
    );
  }

  const visibleOrders = filteredOrders.slice(0, visibleCount);
  const remainingCount = filteredOrders.length - visibleCount;
  const canShowMore = remainingCount > 0;
  const canShowLess = visibleCount > PAGE_SIZE;

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-1 pb-1">
        {/* Side filter */}
        {(['all', 'buy', 'sell'] as SideFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => { setSideFilter(f); setVisibleCount(PAGE_SIZE); }}
            className={`px-2 py-0.5 text-[10px] xl:text-xs rounded transition-colors ${
              sideFilter === f
                ? f === 'buy' ? 'bg-green-500/15 text-green-400 font-medium'
                  : f === 'sell' ? 'bg-red-500/15 text-red-400 font-medium'
                  : 'bg-theme-bg-tertiary text-theme-text-primary font-medium'
                : 'text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-tertiary'
            }`}
          >
            {f === 'all' ? 'All' : f === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
        <span className="w-px h-3 bg-theme-border mx-0.5" />
        {/* Period filter */}
        {(['all', '24h', '7d'] as PeriodFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => { setPeriodFilter(f); setVisibleCount(PAGE_SIZE); }}
            className={`px-2 py-0.5 text-[10px] xl:text-xs rounded transition-colors ${
              periodFilter === f
                ? 'bg-theme-bg-tertiary text-theme-text-primary font-medium'
                : 'text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-tertiary'
            }`}
          >
            {f === 'all' ? 'All' : f.toUpperCase()}
          </button>
        ))}
      </div>

      <table className="w-full text-xs xl:text-sm">
        <thead className="text-theme-text-secondary">
          <tr>
            <th className="py-2 px-2 text-left font-medium">Type</th>
            <th className="py-2 px-2 text-left font-medium">Side</th>
            <th className="py-2 px-2 text-right font-medium">Price ({quoteSymbol})</th>
            <th className="py-2 px-2 text-right font-medium">Filled / Qty</th>
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
                <span className="text-theme-text-secondary">{order.executedQuantity.toFixed(4)}</span>
                <span className="text-theme-text-muted"> / {order.quantity.toFixed(4)}</span>
              </td>
              <td className="py-1.5 px-2 text-center">
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] xl:text-xs font-medium ${
                  order.status === 'filled'
                    ? 'bg-green-600/20 text-green-400'
                    : order.status === 'partial'
                    ? 'bg-yellow-600/20 text-yellow-400'
                    : order.status === 'placed'
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'bg-gray-600/20 text-gray-400'
                }`}>
                  {order.status === 'filled' ? 'Filled'
                    : order.status === 'partial' ? 'Partial'
                    : order.status === 'placed' ? 'Placed'
                    : 'Canceled'}
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
              onClick={() => setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredOrders.length))}
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

      {/* Load older orders from chain */}
      {!canShowMore && hasNextPage && (
        <div className="flex justify-center pt-2 pb-1">
          <button
            onClick={() => fetchNextPage?.()}
            disabled={isFetchingNextPage}
            className="text-xs xl:text-sm text-pd1 dark:text-pd3 hover:underline disabled:opacity-50 transition-colors"
          >
            {isFetchingNextPage ? 'Loading...' : 'Load older orders'}
          </button>
        </div>
      )}
    </div>
  );
}
