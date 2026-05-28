import { useState, useEffect } from 'react';
import type { ExecutionOption } from '../context';
import { useMarket } from '../context/MarketContext';
import { useActiveAddress } from '../../../hooks/useActiveAddress';
import { useTier } from '../../../lib/tier';

interface OrderConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  orderType: 'buy' | 'sell';
  price: string;
  amount: string;
  isLoading: boolean;
  executionOption?: ExecutionOption;
  midPrice?: number;
  onEnableOneClick?: () => void;
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
  midPrice = 0,
  onEnableOneClick,
}: OrderConfirmModalProps) {
  const { currentPool } = useMarket();
  const [skipConfirm, setSkipConfirm] = useState(false);
  // Local submitting flag flips synchronously on click so the button disables
  // before the parent's async isLoading has a chance to propagate. Prevents
  // double-submit during tx build / signing setup.
  const [isSubmitting, setIsSubmitting] = useState(false);
  // NSI tier discount lookup. MUST be called unconditionally above the
  // `if (!isOpen) return null` early return — moving these below the early
  // return changes hook count across renders and trips React #310
  // ("Rendered more hooks than during the previous render"), surfaced as
  // a TradePage ErrorBoundary catch on Buy/Sell click (regression
  // introduced by 3fc6866ff before being moved here).
  const address = useActiveAddress();
  const { data: tierData } = useTier(address);

  // Reset checkbox and submitting flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSkipConfirm(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const priceNum = parseFloat(price) || 0;
  const amountNum = parseFloat(amount) || 0;
  const total = priceNum * amountNum;

  const isBuy = orderType === 'buy';
  const baseToken = currentPool.baseToken.symbol;
  const quoteToken = currentPool.quoteToken.symbol;

  // Dynamic fee from pool config (POST_ONLY = maker fee, others = taker fee).
  // Phase 3: apply NSI tier discount to the baseline. The chain enforces the
  // actual discount; this display mirrors policy.move via standing.ts SSOT.
  const isMakerFee = executionOption === 'POST_ONLY';
  const baselineBps = isMakerFee ? currentPool.makerFeeBps : currentPool.takerFeeBps;
  const discountBps = tierData?.benefits.pado_fee_discount_bps ?? 0;
  // Multiply-then-divide (matches Move integer arithmetic in process_create_with_tier).
  const effectiveBps = (baselineBps * (10000 - discountBps)) / 10000;
  const feeRate = effectiveBps / 10000;
  const fee = total * feeRate;
  const tier = tierData?.tier ?? 1;
  const feeLabel = discountBps > 0
    ? `${(effectiveBps / 100).toFixed(4)}% (Tier ${tier}, -${discountBps / 100}%)`
    : `${(effectiveBps / 100).toFixed(2)}%`;

  // Price vs mid price comparison
  const priceDiffPct = midPrice > 0 && priceNum > 0
    ? ((priceNum - midPrice) / midPrice) * 100
    : 0;
  const absDiffPct = Math.abs(priceDiffPct);
  const isAboveMid = priceDiffPct > 0;

  const handleConfirm = async () => {
    if (isSubmitting || isLoading) return;
    setIsSubmitting(true);
    try {
      if (skipConfirm && onEnableOneClick) {
        onEnableOneClick();
      }
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isLoading || isSubmitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={isBusy ? undefined : onClose}
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

            <div className="flex justify-between items-baseline">
              <span className="text-theme-text-secondary">Price</span>
              <div className="text-right">
                <span className="font-mono">${priceNum.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                {midPrice > 0 && absDiffPct >= 0.01 && (
                  <span className={`ml-1.5 text-xs font-medium ${
                    (isBuy && isAboveMid) || (!isBuy && !isAboveMid)
                      ? absDiffPct >= 2 ? 'text-red-400' : absDiffPct >= 0.5 ? 'text-yellow-400' : 'text-theme-text-muted'
                      : 'text-green-400'
                  }`}>
                    ({isAboveMid ? '+' : '-'}{absDiffPct.toFixed(2)}% mid)
                  </span>
                )}
              </div>
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

          {/* Don't show again */}
          {onEnableOneClick && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipConfirm}
                onChange={(e) => setSkipConfirm(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-theme-border accent-purple-500"
              />
              <span className="text-xs xl:text-sm text-theme-text-muted">
                Don&apos;t show again (enable one-click trading)
              </span>
            </label>
          )}

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onClose}
              className="py-3 bg-theme-bg-tertiary hover:bg-theme-bg-secondary rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isBusy}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className={`py-3 rounded-lg font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isBuy
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
              disabled={isBusy}
            >
              {isBusy ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                `Confirm ${isBuy ? 'Buy' : 'Sell'}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
