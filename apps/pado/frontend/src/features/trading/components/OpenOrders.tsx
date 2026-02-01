import { useState } from 'react';
import type { OpenOrder } from '../../../lib/deepbook';
import { useMarket } from '../context/MarketContext';

const PAGE_SIZE = 5;

interface OpenOrdersProps {
  orders: OpenOrder[];
  isLoading: boolean;
  onCancel: (orderId: string) => void;
}

export function OpenOrders({ orders, isLoading, onCancel }: OpenOrdersProps) {
  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  return (
    <div className="mt-6 pt-4 border-t border-theme-border">
      <h4 className="text-sm xl:text-base font-medium text-theme-text-secondary mb-2">
        Open Orders ({orders.length})
      </h4>
      {orders.length === 0 ? (
        <p className="text-xs xl:text-sm text-theme-text-muted">No open orders</p>
      ) : (
        <div className="space-y-2">
          {visibleOrders.map((order) => (
            <div
              key={order.orderId}
              className="flex items-center justify-between p-2 bg-theme-bg-tertiary rounded text-xs xl:text-sm"
            >
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${order.isBid ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                  {order.isBid ? 'BUY' : 'SELL'}
                </span>
                <span className="text-theme-text-primary">
                  {order.quantity.toFixed(4)} {baseSymbol} @ ${order.price.toFixed(2)}
                </span>
              </div>
              <button
                onClick={() => onCancel(order.orderId)}
                disabled={isLoading}
                className="px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-600/10 dark:hover:bg-red-500/15 disabled:opacity-50 rounded transition-colors"
              >
                Cancel
              </button>
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
