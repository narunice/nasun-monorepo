/**
 * OrderSuccessModal
 *
 * Post-trade confirmation modal for Simple mode prediction orders.
 * Shows educational breakdown of what the order means and expected payouts.
 *
 * Auto-shown for first MODAL_AUTO_SHOW_LIMIT orders per device. After that
 * falls back to toast. User can dismiss permanently via "don't show again".
 *
 * Status variants:
 *   - buy + market (filled):   "Order Filled" — shares bought, payout table
 *   - buy + limit (resting):   "Order Resting" — waiting to fill at price
 *   - sell + market (filled):  "Position Closed" — close order placed
 *   - sell + limit (resting):  "Close Order Resting" — waiting for bid
 */

import { useCallback } from 'react';
import { useShareMarket } from '../hooks/useShareMarket';
import type { PredictionMarket } from '../types';

const MODAL_DISMISSED_KEY = 'pado_pred_order_modal_dismissed';

export function shouldShowOrderModal(): boolean {
  try {
    return localStorage.getItem(MODAL_DISMISSED_KEY) !== '1';
  } catch {
    return false;
  }
}

export function dismissOrderModal(): void {
  try {
    localStorage.setItem(MODAL_DISMISSED_KEY, '1');
  } catch {}
}

export type OrderSuccessData = {
  orderType: 'buy' | 'sell';
  outcomeType: 'yes' | 'no';
  orderMode: 'market' | 'limit';
  isResting: boolean;
  /**
   * Shares actually filled in the trade (UI scale, e.g. 12.5 = 12.5 shares).
   * For buy: shares acquired. For sell: shares closed. Falls back to
   * `requestedShares` if filled data is unavailable (legacy callers).
   */
  shares: number;
  /** Net NUSDC spent (buy) or received (sell) for the filled portion. */
  cost: number;
  priceBps: number;
  digest: string;
  /** Pre-trade estimate of shares the user requested. */
  requestedShares?: number;
  /** True when filled ≈ requested (within rounding tolerance). */
  isFullyFilled?: boolean;
};

interface OrderSuccessModalProps {
  onClose: () => void;
  market: PredictionMarket;
  data: OrderSuccessData;
}

export function OrderSuccessModal({ onClose, market, data }: OrderSuccessModalProps) {
  const { shareTrade } = useShareMarket();

  const handleDismissPermanently = useCallback(() => {
    dismissOrderModal();
    onClose();
  }, [onClose]);

  const handleShare = useCallback(() => {
    shareTrade(market, data.outcomeType === 'yes', data.shares, data.priceBps);
  }, [market, data, shareTrade]);

  const isYes = data.outcomeType === 'yes';
  const pricePct = (data.priceBps / 100).toFixed(0);
  const payout = data.shares;
  const profit = payout - data.cost;
  const returnPct = data.cost > 0 ? (profit / data.cost) * 100 : 0;

  const { title, subtitle } = getModalCopy(data, market.question);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm bg-theme-bg-secondary rounded-2xl shadow-xl overflow-hidden">
        {/* Header stripe */}
        <div className={`h-1.5 w-full ${isYes ? 'bg-predict-yes-bar' : 'bg-predict-no-bar'}`} />

        <div className="p-6">
          {/* Title */}
          <div className="flex items-start justify-between mb-1">
            <h2 id="order-modal-title" className="text-lg font-bold text-theme-text-primary">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="text-theme-text-muted hover:text-theme-text-secondary ml-2 mt-0.5 shrink-0"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Subtitle — market question context */}
          <p className="text-sm text-theme-text-muted mb-5 leading-snug">{subtitle}</p>

          {/* Payout breakdown — hidden when limit order rested with zero fill */}
          {data.orderType === 'buy' && !(data.isResting && data.shares <= 0) && (
            <BuyBreakdown
              data={data}
              isYes={isYes}
              pricePct={pricePct}
              payout={payout}
              profit={profit}
              returnPct={returnPct}
            />
          )}

          {data.orderType === 'sell' && data.shares > 0 && (
            <SellBreakdown data={data} pricePct={pricePct} />
          )}

          {/* Resting explanation for limit orders (and the zero-fill case) */}
          {data.isResting && (
            <div className={data.shares > 0 ? 'mt-3' : ''}>
              <RestingNote
                orderType={data.orderType}
                pricePct={pricePct}
                outcomeType={data.outcomeType}
                remainingShares={
                  data.requestedShares != null
                    ? Math.max(0, data.requestedShares - data.shares)
                    : undefined
                }
              />
            </div>
          )}

          {/* Tx reference */}
          <p className="text-xs text-theme-text-muted mt-4">
            Tx: <span className="font-mono">{data.digest.slice(0, 12)}...</span>
          </p>

          {/* CTAs */}
          <div className="mt-5 flex gap-2">
            {data.orderType === 'buy' && !data.isResting && (
              <button
                type="button"
                onClick={handleShare}
                className="flex-1 py-2.5 rounded-lg border border-theme-border text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary hover:border-theme-text-secondary transition-colors"
              >
                Share on X
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${
                isYes ? 'bg-predict-yes-bar hover:bg-predict-yes-bar-hover' : 'bg-predict-no-bar hover:bg-predict-no-bar-hover'
              } ${data.orderType === 'buy' && !data.isResting ? 'flex-1' : 'w-full'}`}
            >
              Got it
            </button>
          </div>

          {/* Don't show again */}
          <button
            type="button"
            onClick={handleDismissPermanently}
            className="block w-full text-center text-xs text-theme-text-muted hover:text-theme-text-secondary mt-3 transition-colors"
          >
            Don't show this again
          </button>
        </div>
      </div>
    </div>
  );
}

function BuyBreakdown({
  data,
  isYes,
  pricePct,
  payout,
  profit,
  returnPct,
}: {
  data: OrderSuccessData;
  isYes: boolean;
  pricePct: string;
  payout: number;
  profit: number;
  returnPct: number;
}) {
  const outcomeLabel = data.outcomeType.toUpperCase();
  const loseLabel = isYes ? 'NO' : 'YES';

  const hasFillData = data.requestedShares != null;
  const isPartialFill =
    hasFillData && data.isFullyFilled === false && data.shares > 0;
  const sharesLabel = hasFillData ? 'Shares filled' : 'Shares (est.)';
  const sharesPrefix = hasFillData ? '' : '~';

  return (
    <div className="space-y-2.5">
      {/* What you bought */}
      <div className="bg-theme-bg-tertiary rounded-xl p-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-theme-text-muted">{sharesLabel}</span>
          <span className="font-semibold text-theme-text-primary tabular-nums">
            {sharesPrefix}{data.shares.toFixed(2)} {outcomeLabel}
          </span>
        </div>
        {isPartialFill && data.requestedShares != null && (
          <div className="text-xs text-amber-500">
            Filled {data.shares.toFixed(2)} of {data.requestedShares.toFixed(2)} requested
            {data.isResting
              ? ` — remainder resting at ${pricePct}¢`
              : ' — remainder refunded'}
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Price per share</span>
          <span className="font-mono text-theme-text-secondary">{pricePct}¢</span>
        </div>
        <div className="flex justify-between border-t border-theme-border pt-1.5">
          <span className="text-theme-text-muted">Total cost</span>
          <span className="font-semibold text-theme-text-primary tabular-nums">
            ${data.cost.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Payout scenarios */}
      {!data.isResting && (
        <div className="space-y-1.5">
          <p className="text-xs text-theme-text-muted uppercase tracking-wide font-medium">Payout scenarios</p>
          <div className={`rounded-xl p-3 border ${isYes ? 'bg-predict-yes-bg-soft border-predict-yes-border' : 'bg-predict-no-bg-soft border-predict-no-border'}`}>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-theme-text-secondary">
                If {outcomeLabel} wins
              </span>
              <div className="text-right">
                <span className={`text-lg font-bold ${isYes ? 'text-predict-yes' : 'text-predict-no'}`}>
                  ${payout.toFixed(2)}
                </span>
                <span className={`text-xs ml-1 ${isYes ? 'text-predict-yes' : 'text-predict-no'}`}>
                  (+{returnPct >= 0 ? Math.min(returnPct, 9999).toFixed(0) : '0'}%)
                </span>
              </div>
            </div>
            <p className="text-xs text-theme-text-muted mt-1">
              +${profit.toFixed(2)} profit on ${data.cost.toFixed(2)} invested
            </p>
          </div>
          <div className="bg-theme-bg-tertiary rounded-xl p-3 border border-theme-border">
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-theme-text-secondary">If {loseLabel} wins</span>
              <span className="text-sm font-semibold text-theme-text-muted">$0</span>
            </div>
            <p className="text-xs text-theme-text-muted mt-1">
              Full loss of ${data.cost.toFixed(2)} stake
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SellBreakdown({ data, pricePct }: { data: OrderSuccessData; pricePct: string }) {
  const receive = data.cost > 0 ? data.cost : data.shares * (data.priceBps / 10000);
  const receiveLabel = data.cost > 0 ? 'Received' : 'Estimated receive';
  const isPartial = data.isFullyFilled === false && data.requestedShares != null;
  return (
    <div className="bg-theme-bg-tertiary rounded-xl p-3 space-y-1.5 text-sm">
      <div className="flex justify-between">
        <span className="text-theme-text-muted">Shares sold</span>
        <span className="font-semibold text-theme-text-primary tabular-nums">
          {data.shares.toFixed(2)} {data.outcomeType.toUpperCase()}
        </span>
      </div>
      {isPartial && data.requestedShares != null && (
        <div className="text-xs text-amber-500">
          Closed {data.shares.toFixed(2)} of {data.requestedShares.toFixed(2)} requested
          {data.isResting
            ? ` — remainder resting at ${pricePct}¢`
            : ' — no more bids available'}
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-theme-text-muted">At price</span>
        <span className="font-mono text-theme-text-secondary">{pricePct}¢</span>
      </div>
      <div className="flex justify-between border-t border-theme-border pt-1.5">
        <span className="text-theme-text-muted">{receiveLabel}</span>
        <span className="font-semibold text-theme-text-primary tabular-nums">
          {data.cost > 0 ? '$' : '~$'}{receive.toFixed(2)} NUSDC
        </span>
      </div>
    </div>
  );
}

function RestingNote({
  orderType,
  pricePct,
  outcomeType,
  remainingShares,
}: {
  orderType: 'buy' | 'sell';
  pricePct: string;
  outcomeType: 'yes' | 'no';
  remainingShares?: number;
}) {
  const outcomeLabel = outcomeType.toUpperCase();
  const remainderText =
    remainingShares != null && remainingShares > 0.01
      ? `${remainingShares.toFixed(2)} share${remainingShares >= 1.005 ? 's' : ''} remaining`
      : null;
  return (
    <div className="bg-notice-bg border border-notice-border rounded-xl p-3 text-sm">
      <p className="font-medium text-notice-text mb-1">
        {orderType === 'buy' ? 'Waiting to fill' : 'Close order resting'}
        {remainderText ? ` — ${remainderText}` : ''}
      </p>
      {orderType === 'buy' ? (
        <p className="text-theme-text-secondary leading-snug">
          Your limit buy is resting at {pricePct}¢. You'll receive {outcomeLabel} shares
          when a seller accepts your price. You can cancel it from Open Orders anytime.
        </p>
      ) : (
        <p className="text-theme-text-secondary leading-snug">
          Your close order is resting at {pricePct}¢. Your position closes
          when a buyer appears at this price. You can cancel from Open Orders.
        </p>
      )}
    </div>
  );
}

function getModalCopy(data: OrderSuccessData, question: string): { title: string; subtitle: string } {
  const outcomeLabel = data.outcomeType.toUpperCase();
  const isZeroFill = data.shares <= 0;
  const isPartial = data.isFullyFilled === false && !isZeroFill;

  if (data.orderType === 'buy') {
    if (data.isResting && isZeroFill) {
      return {
        title: 'Order Resting',
        subtitle: `Your limit buy is waiting to fill at ${(data.priceBps / 100).toFixed(0)}¢. You'll get ${outcomeLabel} shares when a seller matches your price.`,
      };
    }
    if (isPartial) {
      return {
        title: 'Order Partially Filled',
        subtitle: data.isResting
          ? `Filled some ${outcomeLabel} shares. The remainder is resting at ${(data.priceBps / 100).toFixed(0)}¢.`
          : `Filled some ${outcomeLabel} shares. The remainder was refunded (no more matching liquidity).`,
      };
    }
    return {
      title: 'Order Filled',
      subtitle: `You're predicting "${question}" will resolve ${outcomeLabel}.`,
    };
  }

  if (data.isResting && isZeroFill) {
    return {
      title: 'Close Order Resting',
      subtitle: `Your ${outcomeLabel} position close is waiting for a buyer at ${(data.priceBps / 100).toFixed(0)}¢.`,
    };
  }
  if (isPartial) {
    return {
      title: 'Close Partially Filled',
      subtitle: data.isResting
        ? `Closed some ${outcomeLabel} shares. The remainder is resting at ${(data.priceBps / 100).toFixed(0)}¢.`
        : `Closed some ${outcomeLabel} shares. No more bids available right now.`,
    };
  }
  return {
    title: 'Position Closed',
    subtitle: `Your ${outcomeLabel} position close order was submitted.`,
  };
}
