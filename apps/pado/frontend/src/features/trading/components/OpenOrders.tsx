import { useState } from 'react';
import type { OpenOrder } from '../../../lib/deepbook';
import { useMarket } from '../context/MarketContext';

const PAGE_SIZE = 5;

interface OpenOrdersProps {
  orders: OpenOrder[];
  isLoading: boolean;
  onCancel: (orderId: string) => void;
  onCancelAll?: (orderIds: string[]) => void;
}

export function OpenOrders({ orders, isLoading, onCancel, onCancelAll }: OpenOrdersProps) {
  const { currentPool } = useMarket();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [confirmCancelAll, setConfirmCancelAll] = useState<string[] | null>(null);

  // Sort orders by orderId descending (newest first)
  const sortedOrders = [...orders].sort((a, b) => {
    const aId = BigInt(a.orderId);
    const bId = BigInt(b.orderId);
    return aId > bId ? -1 : aId < bId ? 1 : 0;
  });

  const visibleOrders = sortedOrders.slice(0, visibleCount);
  const remainingCount = sortedOrders.length - visibleCount;
  const canShowMore = remainingCount > 0;
  const canShowLess = visibleCount > PAGE_SIZE;

  const handleShowMore = () => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, sortedOrders.length));
  };

  const handleShowLess = () => {
    setVisibleCount(PAGE_SIZE);
  };

  // Capture order IDs at confirmation time, not at execution time
  const handleCancelAll = () => {
    if (!confirmCancelAll) {
      setConfirmCancelAll(orders.map((o) => o.orderId));
      return;
    }
    const ids = confirmCancelAll;
    setConfirmCancelAll(null);
    onCancelAll?.(ids);
  };

  const quoteSymbol = currentPool.quoteToken.symbol;

  const formatPrice = (price: number) =>
    `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatTotal = (price: number, qty: number) => {
    const total = price * qty;
    return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div>
      {orders.length === 0 ? (
        <div className="text-center py-2">
          <p className="text-xs xl:text-sm text-theme-text-muted">No open orders</p>
          <p className="text-[10px] text-theme-text-muted mt-0.5">Place an order to get started</p>
        </div>
      ) : (
        <div>
          {/* Header row with Cancel All */}
          <div className="flex items-center justify-between mb-2 pb-1 border-b border-theme-border">
            <div className="text-trading-xs xl:text-trading-sm text-theme-text-muted grid grid-cols-5 gap-2 flex-1">
              <span>Side</span>
              <span className="text-right">Price ({quoteSymbol})</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Total</span>
              <span className="text-right">Action</span>
            </div>
          </div>

          {/* Cancel All */}
          {onCancelAll && orders.length > 1 && (
            <div className="flex justify-end items-center gap-2 mb-1">
              {confirmCancelAll ? (
                <>
                  <span className="text-xs text-theme-text-muted">Cancel all {confirmCancelAll.length} orders?</span>
                  <button
                    onClick={handleCancelAll}
                    disabled={isLoading}
                    className="px-2 py-0.5 text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmCancelAll(null)}
                    className="px-2 py-0.5 text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
                  >
                    No
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCancelAll}
                  disabled={isLoading}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                >
                  Cancel All ({orders.length})
                </button>
              )}
            </div>
          )}

          {/* Order rows */}
          {visibleOrders.map((order) => (
            <div
              key={order.orderId}
              className="grid grid-cols-5 gap-2 py-1.5 text-trading-sm xl:text-trading-lg items-center hover:bg-theme-bg-tertiary/30 transition-colors rounded"
            >
              <span className={`font-semibold ${order.isBid ? 'text-green-400' : 'text-red-400'}`}>
                {order.isBid ? 'BUY' : 'SELL'}
              </span>
              <span className="text-right font-mono text-theme-text-primary">
                {formatPrice(order.price)}
              </span>
              <span className="text-right font-mono text-theme-text-primary">
                {order.quantity.toFixed(4)}
              </span>
              <span className="text-right font-mono text-theme-text-secondary">
                {formatTotal(order.price, order.quantity)}
              </span>
              <div className="text-right">
                <button
                  onClick={() => onCancel(order.orderId)}
                  disabled={isLoading}
                  className="px-1.5 py-0.5 text-trading-xs font-medium rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}

          {/* Show more / Show less buttons */}
          {(canShowMore || canShowLess) && (
            <div className="flex justify-center gap-3 pt-1">
              {canShowMore && (
                <button
                  onClick={handleShowMore}
                  className="text-xs xl:text-sm text-theme-text-muted hover:text-theme-text-secondary transition-colors"
                >
                  Show {Math.min(PAGE_SIZE, remainingCount)} more
                </button>
              )}
              {canShowLess && (
                <button
                  onClick={handleShowLess}
                  className="text-xs xl:text-sm text-theme-text-muted hover:text-theme-text-secondary transition-colors"
                >
                  Collapse
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
