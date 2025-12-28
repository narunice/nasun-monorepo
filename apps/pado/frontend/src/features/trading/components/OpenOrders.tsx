import type { OpenOrder } from '../../../lib/deepbook';
import { useMarket } from '../context/MarketContext';

interface OpenOrdersProps {
  orders: OpenOrder[];
  isLoading: boolean;
  onCancel: (orderId: string) => void;
}

export function OpenOrders({ orders, isLoading, onCancel }: OpenOrdersProps) {
  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;

  return (
    <div className="mt-6 pt-4 border-t border-theme-border">
      <h4 className="text-sm font-medium text-theme-text-secondary mb-2">
        Open Orders ({orders.length})
      </h4>
      {orders.length === 0 ? (
        <p className="text-xs text-theme-text-muted">No open orders</p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div
              key={order.orderId}
              className="flex items-center justify-between p-2 bg-theme-bg-tertiary rounded text-xs"
            >
              <div className="flex items-center gap-2">
                <span className={order.isBid ? 'text-green-400' : 'text-red-400'}>
                  {order.isBid ? 'BUY' : 'SELL'}
                </span>
                <span className="text-theme-text-primary">
                  {order.quantity.toFixed(4)} {baseSymbol} @ ${order.price.toFixed(2)}
                </span>
              </div>
              <button
                onClick={() => onCancel(order.orderId)}
                disabled={isLoading}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded text-white"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
