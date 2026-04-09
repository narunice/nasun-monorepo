/**
 * SwapSuccessView
 * Success state after a swap is executed.
 * Shows checkmark, trade details with Sell/Buy labels, and "New Trade" button.
 * Includes Trading Balance info banner and optional "Withdraw to Wallet" CTA.
 */

interface SwapSuccessViewProps {
  payToken: string;
  receiveToken: string;
  payAmount: number;
  receiveAmount: number;
  isBuying: boolean;
  onNewSwap: () => void;
  onWithdraw?: (receiveToken: string) => void;
}

export function SwapSuccessView({
  payToken,
  receiveToken,
  payAmount,
  receiveAmount,
  isBuying,
  onNewSwap,
  onWithdraw,
}: SwapSuccessViewProps) {
  const payDecimals = payToken === 'NUSDC' ? 2 : 6;
  const receiveDecimals = receiveToken === 'NUSDC' ? 2 : 6;
  const actionLabel = isBuying ? 'Buy' : 'Sell';

  return (
    <div className="h-full flex flex-col items-center justify-center">
      {/* Checkmark */}
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12l5 5L19 7"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-theme-text-primary mb-1">{actionLabel} Complete</h3>

      {/* Details */}
      <div className="text-xs text-theme-text-secondary text-center space-y-1 mb-4">
        <p>
          Paid {payAmount.toLocaleString('en-US', { maximumFractionDigits: payDecimals })} {payToken}
        </p>
        <p className="text-theme-text-primary font-medium">
          Received ~{receiveAmount.toLocaleString('en-US', { maximumFractionDigits: receiveDecimals })} {receiveToken}
        </p>
      </div>

      {/* Trading Balance Info Banner */}
      {onWithdraw ? (
        <div className="w-full bg-pd3/10 border border-pd3/30 rounded-lg px-3 py-2 mb-4">
          <p className="text-[11px] text-pd3 text-center leading-relaxed">
            Funds are in your Trading Balance.
            <br />
            Withdraw to move them to your wallet.
          </p>
        </div>
      ) : (
        <div className="w-full bg-pd3/10 border border-pd3/30 rounded-lg px-3 py-2 mb-4">
          <p className="text-[11px] text-pd3 text-center leading-relaxed">
            Funds are in your Trading Balance.
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="w-full flex gap-2">
        {onWithdraw && (
          <button
            onClick={() => onWithdraw(receiveToken)}
            className="flex-1 h-10 rounded-lg text-xs font-semibold text-white bg-orange-500 hover:bg-orange-500/80 transition-colors"
          >
            Withdraw to Wallet
          </button>
        )}
        <button
          onClick={onNewSwap}
          className={`h-10 rounded-lg text-xs font-semibold text-white bg-pd1 hover:bg-pd1/80 transition-colors ${onWithdraw ? 'flex-1' : 'w-full'}`}
        >
          New Trade
        </button>
      </div>
    </div>
  );
}
