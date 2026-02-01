/**
 * InsufficientBalancePrompt
 *
 * Shows insufficient balance warning with actionable guidance.
 * Guides users to get tokens from their wallet.
 */

interface InsufficientBalancePromptProps {
  /** Token symbol (e.g., NUSDC, NBTC) */
  tokenSymbol: string;
  /** Amount needed for the trade */
  requiredAmount: number;
  /** Current available balance */
  availableAmount: number;
  /** Custom message override */
  message?: string;
}

export function InsufficientBalancePrompt({
  tokenSymbol,
  requiredAmount,
  availableAmount,
  message,
}: InsufficientBalancePromptProps) {
  const shortfall = requiredAmount - availableAmount;

  // Don't render if no shortfall
  if (shortfall <= 0) return null;

  const defaultMessage = `Need ${shortfall.toFixed(2)} more ${tokenSymbol}`;
  const displayMessage = message || defaultMessage;

  return (
    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
      <div className="flex items-start gap-2">
        <svg
          className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="flex-1">
          <p className="text-sm xl:text-base text-red-400 font-medium">{displayMessage}</p>
          <p className="text-xs xl:text-sm text-theme-text-muted mt-0.5">
            Available: {availableAmount.toFixed(2)} {tokenSymbol}
          </p>
          <p className="text-xs xl:text-sm text-theme-text-muted mt-1">
            Get {tokenSymbol} from Faucet in your wallet.
          </p>
        </div>
      </div>
    </div>
  );
}
