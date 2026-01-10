/**
 * InsufficientBalancePrompt
 *
 * Shows insufficient balance warning with actionable CTA buttons:
 * - Deposit from wallet (if funds available)
 * - Get from Faucet (devnet/testnet only)
 *
 * @version 1.0.0 (Phase 16.1c)
 */

import { isFaucetAvailable } from '../../../config/network';

interface InsufficientBalancePromptProps {
  /** Token symbol (e.g., NUSDC, NBTC) */
  tokenSymbol: string;
  /** Amount needed for the trade */
  requiredAmount: number;
  /** Current available balance */
  availableAmount: number;
  /** Callback when user clicks deposit */
  onDeposit?: () => void;
  /** Callback when user clicks faucet */
  onFaucet?: () => void;
  /** Whether deposit is available (user has wallet funds) */
  canDeposit?: boolean;
  /** Custom message override */
  message?: string;
}

export function InsufficientBalancePrompt({
  tokenSymbol,
  requiredAmount,
  availableAmount,
  onDeposit,
  onFaucet,
  canDeposit = false,
  message,
}: InsufficientBalancePromptProps) {
  const shortfall = requiredAmount - availableAmount;
  const showFaucet = isFaucetAvailable();

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
          <p className="text-sm text-red-400 font-medium">{displayMessage}</p>
          <p className="text-xs text-theme-text-muted mt-0.5">
            Available: {availableAmount.toFixed(2)} {tokenSymbol}
          </p>

          {/* CTA Buttons */}
          {(canDeposit || showFaucet) && (
            <div className="flex gap-2 mt-2">
              {canDeposit && onDeposit && (
                <button
                  onClick={onDeposit}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                >
                  Deposit from Wallet
                </button>
              )}
              {showFaucet && onFaucet && (
                <button
                  onClick={onFaucet}
                  className="px-3 py-1.5 text-xs font-medium bg-theme-bg-tertiary hover:bg-theme-bg-secondary text-theme-text-primary rounded transition-colors"
                >
                  Get from Faucet
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
