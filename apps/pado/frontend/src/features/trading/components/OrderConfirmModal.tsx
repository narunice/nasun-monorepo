import { useMarket } from '../context/MarketContext';

interface OrderConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  orderType: 'buy' | 'sell';
  price: string;
  amount: string;
  isLoading: boolean;
}

export function OrderConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  orderType,
  price,
  amount,
  isLoading,
}: OrderConfirmModalProps) {
  const { currentPool } = useMarket();

  if (!isOpen) return null;

  const priceNum = parseFloat(price) || 0;
  const amountNum = parseFloat(amount) || 0;
  const total = priceNum * amountNum;

  const isBuy = orderType === 'buy';
  const baseToken = currentPool.baseToken.symbol;
  const quoteToken = currentPool.quoteToken.symbol;

  // Fee calculation (taker fee: 0.1%)
  const feeRate = 0.001;
  const fee = total * feeRate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-theme-bg-secondary rounded-lg w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className={`p-4 ${isBuy ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
          <h2 className={`text-lg font-semibold ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
            {isBuy ? 'Buy Order' : 'Sell Order'} Confirmation
          </h2>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Order Summary */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-theme-text-secondary">Type</span>
              <span className={`font-medium ${isBuy ? 'text-green-400' : 'text-red-400'}`}>
                {isBuy ? 'Buy' : 'Sell'} {baseToken}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-theme-text-secondary">Price</span>
              <span className="font-mono">${priceNum.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-theme-text-secondary">Amount</span>
              <span className="font-mono">{amountNum.toFixed(4)} {baseToken}</span>
            </div>

            <div className="border-t border-theme-border my-2" />

            <div className="flex justify-between">
              <span className="text-theme-text-secondary">Subtotal</span>
              <span className="font-mono">{total.toFixed(2)} {quoteToken}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-theme-text-muted">Est. Fee (0.1%)</span>
              <span className="text-theme-text-muted font-mono">~{fee.toFixed(2)} {quoteToken}</span>
            </div>

            <div className="border-t border-theme-border my-2" />

            <div className="flex justify-between text-lg font-semibold">
              <span>{isBuy ? 'You Pay' : 'You Receive'}</span>
              <span className={isBuy ? 'text-red-400' : 'text-green-400'}>
                {isBuy
                  ? `~${(total + fee).toFixed(2)} ${quoteToken}`
                  : `~${(total - fee).toFixed(2)} ${quoteToken}`
                }
              </span>
            </div>
          </div>

          {/* Warning */}
          <div className="p-3 bg-yellow-900/20 border border-yellow-700/50 rounded text-sm text-yellow-400">
            This is a limit order. It will be placed in the order book and may not execute immediately.
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onClose}
              className="py-3 bg-theme-bg-tertiary hover:bg-theme-bg-secondary rounded-lg font-medium transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`py-3 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                isBuy
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : `Confirm ${isBuy ? 'Buy' : 'Sell'}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
