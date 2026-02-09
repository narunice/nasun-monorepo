/**
 * TransferModal
 * Per-token deposit/withdraw modal with amount input.
 * Follows OrderConfirmModal pattern (fixed overlay + backdrop + card).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { NATIVE_TOKEN_TYPE, GAS_RESERVE_HUMAN } from '../constants';

interface TransferModalProps {
  onClose: () => void;
  action: 'deposit' | 'withdraw';
  tokenSymbol: string;
  tokenType: string;
  tokenDecimals: number;
  availableBalance: number;
  isLoading: boolean;
  onConfirm: (amount: number, coinType: string, decimals: number, symbol: string) => Promise<any>;
}

export function TransferModal({
  onClose,
  action,
  tokenSymbol,
  tokenType,
  tokenDecimals,
  availableBalance,
  isLoading,
  onConfirm,
}: TransferModalProps) {
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // Reset state on mount (parent conditionally renders this component)
  useEffect(() => {
    setAmount('');
    setIsSubmitting(false);
    setLocalError(null);
    submittingRef.current = false;
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submittingRef.current) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isDeposit = action === 'deposit';
  const isNativeToken = tokenType === NATIVE_TOKEN_TYPE;

  // Display decimals: more for high-decimal tokens (NBTC=8), fewer for low-decimal (NUSDC=6)
  const displayDecimals = tokenDecimals > 6 ? 4 : 2;

  // For native token deposits, max is reduced by gas reserve
  const maxAmount = isDeposit && isNativeToken
    ? Math.max(0, availableBalance - GAS_RESERVE_HUMAN)
    : availableBalance;

  const numAmount = parseFloat(amount) || 0;
  const isValid = numAmount > 0 && numAmount <= maxAmount;
  const exceedsBalance = numAmount > maxAmount && numAmount > 0;

  const setPercentage = useCallback((pct: number) => {
    const val = maxAmount * pct;
    if (val <= 0) return;
    setAmount(val.toFixed(displayDecimals));
  }, [maxAmount, displayDecimals]);

  const handleConfirm = useCallback(async () => {
    if (!isValid || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      setLocalError(null);
      const result = await onConfirm(numAmount, tokenType, tokenDecimals, tokenSymbol);
      if (result?.success) {
        onClose();
      } else {
        setLocalError(result?.error || 'Transaction failed. Please try again.');
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [isValid, numAmount, tokenType, tokenDecimals, tokenSymbol, onConfirm, onClose]);

  const busy = isLoading || isSubmitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={() => { if (!busy) onClose(); }} />

      {/* Modal */}
      <div className="relative bg-theme-bg-secondary rounded-lg w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className={`p-4 ${isDeposit
          ? 'bg-blue-50 dark:bg-blue-900/20'
          : 'bg-orange-50 dark:bg-orange-900/20'
        }`}>
          <h2 className={`text-lg xl:text-xl font-semibold ${isDeposit
            ? 'text-blue-700 dark:text-blue-400'
            : 'text-orange-700 dark:text-orange-400'
          }`}>
            {isDeposit ? 'Deposit' : 'Withdraw'} {tokenSymbol}
          </h2>
          <p className="text-sm text-theme-text-secondary mt-0.5">
            {isDeposit ? 'Move from wallet to trading balance' : 'Move from trading balance to wallet'}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Available balance */}
          <div className="flex justify-between text-sm">
            <span className="text-theme-text-secondary">
              {isDeposit ? 'Wallet Balance' : 'Trading Balance'}
            </span>
            <span className="font-mono text-theme-text-primary">
              {availableBalance.toFixed(displayDecimals)} {tokenSymbol}
            </span>
          </div>

          {/* Amount input */}
          <div>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => {
                  const val = e.target.value;
                  // Only allow digits and a single decimal point (reject scientific notation, Infinity, etc.)
                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    setAmount(val);
                  }
                }}
                placeholder="0.00"
                min="0"
                step={Math.pow(10, -displayDecimals)}
                disabled={busy}
                className={`w-full px-3 py-3 pr-20 bg-theme-bg-tertiary border rounded-lg text-lg font-mono
                  text-theme-text-primary placeholder:text-theme-text-muted
                  focus:outline-none focus:ring-1
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${exceedsBalance
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30'
                    : 'border-theme-border focus:border-pd1 focus:ring-pd1/30'
                  }`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-theme-text-muted">
                {tokenSymbol}
              </span>
            </div>

            {/* Validation message */}
            {exceedsBalance && (
              <p className="mt-1 text-xs text-red-400">
                Exceeds available balance
                {isDeposit && isNativeToken && ` (${GAS_RESERVE_HUMAN} ${tokenSymbol} reserved for gas)`}
              </p>
            )}
          </div>

          {/* Quick amount buttons */}
          <div className="flex gap-2">
            {[0.25, 0.5, 0.75, 1].map((pct) => (
              <button
                key={pct}
                onClick={() => setPercentage(pct)}
                disabled={busy || maxAmount <= 0}
                className="flex-1 py-1.5 text-xs xl:text-sm font-medium rounded
                  bg-theme-bg-tertiary hover:bg-theme-bg-secondary
                  text-theme-text-secondary hover:text-theme-text-primary
                  border border-theme-border
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-colors"
              >
                {pct === 1 ? 'Max' : `${pct * 100}%`}
              </button>
            ))}
          </div>

          {/* Native token gas warning */}
          {isDeposit && isNativeToken && availableBalance > 0 && (
            <div className="flex items-start gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-600 dark:text-yellow-400">
              <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>{GAS_RESERVE_HUMAN} {tokenSymbol} is reserved for transaction fees</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onClose}
              className="py-3 bg-theme-bg-tertiary hover:bg-theme-bg-secondary rounded-lg font-medium transition-colors"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!isValid || busy}
              className={`py-3 rounded-lg font-medium text-white transition-colors disabled:opacity-50 ${isDeposit
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                `${isDeposit ? 'Deposit' : 'Withdraw'} ${tokenSymbol}`
              )}
            </button>
          </div>

          {/* Error display */}
          {localError && (
            <p className="text-red-400 text-xs" role="alert">{localError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
