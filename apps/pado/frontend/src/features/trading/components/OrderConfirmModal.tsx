import type { ExecutionOption } from '../context';
import { useMarket } from '../context/MarketContext';

interface OrderConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  orderType: 'buy' | 'sell';
  price: string;
  amount: string;
  isLoading: boolean;
  executionOption?: ExecutionOption;
}

export function OrderConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  orderType,
  price,
  amount,
  isLoading,
  executionOption = 'GTC',
}: OrderConfirmModalProps) {
  const { currentPool } = useMarket();

  if (!isOpen) return null;

  const priceNum = parseFloat(price) || 0;
  const amountNum = parseFloat(amount) || 0;
  const total = priceNum * amountNum;

  const isBuy = orderType === 'buy';
  const baseToken = currentPool.baseToken.symbol;
  const quoteToken = currentPool.quoteToken.symbol;

  // Dynamic fee from pool config (POST_ONLY = maker fee, others = taker fee)
  const isMakerFee = executionOption === 'POST_ONLY';
  const feeBps = isMakerFee ? currentPool.makerFeeBps : currentPool.takerFeeBps;
  const feeRate = feeBps / 10000;
  const fee = total * feeRate;
  const feeLabel = `${(feeBps / 100).toFixed(2)}%`;

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
        <div className={`p-4 ${isBuy ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <h2 className={`text-lg xl:text-xl font-semibold ${isBuy ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {isBuy ? 'Buy Order' : 'Sell Order'}
          </h2>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Order Summary */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-theme-text-secondary">Type</span>
              <span className={`font-medium ${isBuy ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
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

            <div className="flex justify-between text-sm xl:text-base">
              <span className="text-theme-text-muted">Est. Fee ({feeLabel})</span>
              <span className="text-theme-text-muted font-mono">~{fee.toFixed(2)} {quoteToken}</span>
            </div>

            <div className="border-t border-theme-border my-2" />

            <div className="flex justify-between text-lg xl:text-xl font-semibold">
              <span>{isBuy ? 'You Pay' : 'You Receive'}</span>
              <span className={isBuy ? '' : 'text-green-600 dark:text-green-400'}>
                {isBuy
                  ? `~${(total + fee).toFixed(2)} ${quoteToken}`
                  : `~${(total - fee).toFixed(2)} ${quoteToken}`
                }
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-theme-bg-secondary dark:bg-white/5 border border-theme-border dark:border-white/10 rounded-lg text-sm xl:text-base text-theme-text-secondary">
            <svg className="w-4 h-4 mt-0.5 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>This is a limit order. It will be placed in the order book and may not execute immediately.</span>
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
              className={`py-3 rounded-lg font-medium text-white transition-colors disabled:opacity-50 ${
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
