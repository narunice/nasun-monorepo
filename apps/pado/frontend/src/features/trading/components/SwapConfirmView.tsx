/**
 * SwapConfirmView
 * Confirmation step before executing a swap order.
 * Shows trade summary and Confirm/Back buttons.
 */

interface SwapConfirmViewProps {
  payToken: string;
  receiveToken: string;
  payAmount: number;
  receiveAmount: number;
  fee: number;
  feePercent: string;
  slippage: number;
  midPrice: number;
  baseSymbol: string;
  avgPrice?: number;
  impactPct?: number;
  onConfirm: () => void;
  onBack: () => void;
  isLoading: boolean;
}

export function SwapConfirmView({
  payToken,
  receiveToken,
  payAmount,
  receiveAmount,
  fee,
  feePercent,
  slippage,
  midPrice,
  baseSymbol,
  avgPrice,
  impactPct,
  onConfirm,
  onBack,
  isLoading,
}: SwapConfirmViewProps) {
  const payDecimals = payToken === 'NUSDC' ? 2 : 6;
  const receiveDecimals = receiveToken === 'NUSDC' ? 2 : 6;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="text-center mb-4 shrink-0">
        <h3 className="text-sm font-semibold text-theme-text-primary">Confirm Swap</h3>
      </div>

      {/* Summary */}
      <div className="bg-theme-bg-tertiary/50 rounded-lg p-3 space-y-2.5 shrink-0">
        <div className="flex justify-between text-xs">
          <span className="text-theme-text-muted">You Pay</span>
          <span className="font-mono font-medium text-theme-text-primary">
            {payAmount.toLocaleString('en-US', { maximumFractionDigits: payDecimals })} {payToken}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-theme-text-muted">You Receive</span>
          <span className="font-mono font-medium text-theme-text-primary">
            ~{receiveAmount.toLocaleString('en-US', { maximumFractionDigits: receiveDecimals })} {receiveToken}
          </span>
        </div>
        <div className="border-t border-theme-border/30 pt-2 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-theme-text-muted">Rate</span>
            <span className="font-mono text-theme-text-secondary">
              1 {baseSymbol} = ${midPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-theme-text-muted">Fee ({feePercent})</span>
            <span className="font-mono text-theme-text-muted">~${fee.toFixed(2)}</span>
          </div>
          {avgPrice != null && avgPrice > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-theme-text-muted">Est. Avg Price</span>
              <span className="font-mono text-theme-text-secondary">
                ${avgPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
          {impactPct != null && impactPct > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-theme-text-muted">Price Impact</span>
              <span className={`font-mono font-medium ${
                impactPct < 0.5 ? 'text-green-400' :
                impactPct < 2 ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {impactPct < 0.01 ? '<0.01' : impactPct.toFixed(2)}%
              </span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-theme-text-muted">Max Slippage</span>
            <span className="font-mono text-theme-text-muted">{slippage}%</span>
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-h-2" />

      {/* Actions */}
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onBack}
          disabled={isLoading}
          className="flex-1 h-10 rounded-lg text-xs font-semibold bg-theme-bg-tertiary text-theme-text-secondary hover:text-theme-text-primary transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="flex-1 h-10 rounded-lg text-xs font-semibold text-white bg-pd1 hover:bg-pd1/80 disabled:bg-pd1/60 transition-colors"
        >
          {isLoading ? 'Swapping...' : 'Confirm Swap'}
        </button>
      </div>
    </div>
  );
}
