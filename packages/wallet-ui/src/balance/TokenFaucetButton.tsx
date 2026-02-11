/**
 * Token-specific Faucet Button
 * Displays only on devnet/testnet when a faucet handler is registered for the token
 */

import { useState, useCallback } from 'react';
import { useTokenFaucet, hasTokenFaucet, useNetwork, useMultiBalance } from '@nasun/wallet';

interface TokenFaucetButtonProps {
  /** Token symbol (e.g., 'NSN', 'NBTC') */
  symbol: string;
  /** Compact mode (smaller button) */
  compact?: boolean;
  /** Custom class */
  className?: string;
  /** Success callback */
  onSuccess?: () => void;
  /** Error callback */
  onError?: (error: Error) => void;
}

export function TokenFaucetButton({
  symbol,
  compact = false,
  className = '',
  onSuccess,
  onError,
}: TokenFaucetButtonProps) {
  const { isDevnet, isTestnet } = useNetwork();
  const { requestFaucet, isLoading, isCooldown, canUseFaucet } = useTokenFaucet();
  const { data: balances } = useMultiBalance({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string; detail?: string } | null>(null);

  const loading = isLoading(symbol);
  const cooldown = isCooldown(symbol);

  // Check if NSN is needed for gas fee (for non-NSN tokens)
  const nsnBalance = balances?.native?.balance ?? 0n;
  const needsNsnFirst = symbol !== 'NSN' && nsnBalance === 0n;

  const disabled = loading || cooldown || !canUseFaucet || needsNsnFirst;

  const handleClick = useCallback(async () => {
    if (disabled) return;

    setMessage(null);

    try {
      const result = await requestFaucet(symbol);
      if (result.success) {
        setMessage({ type: 'success', text: 'Received!' });
        onSuccess?.();
      } else {
        // Show cooldown-specific short text, full message in title
        const shortText = result.error?.includes('cooldown') ? 'Cooldown' : 'Failed';
        setMessage({ type: 'error', text: shortText, detail: result.error });
        onError?.(new Error(result.error || 'Faucet request failed'));
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error' });
      onError?.(err instanceof Error ? err : new Error('Unknown error'));
    }

    // Auto-hide message after 5s (longer for errors so user can read)
    setTimeout(() => setMessage(null), 5000);
  }, [disabled, requestFaucet, symbol, onSuccess, onError]);

  // Tooltip message for when NSN is needed
  const nsnRequiredMessage = `NSN tokens are required for gas fees. Please get NSN first before requesting ${symbol}.`;

  // Only show on devnet/testnet
  if (!isDevnet && !isTestnet) return null;

  // Only show if faucet handler is registered
  if (!hasTokenFaucet(symbol)) return null;

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`px-2 py-0.5 text-xs xl:text-sm font-medium rounded transition-colors
          ${message?.type === 'success'
            ? 'bg-green-500/20 text-green-400'
            : message?.type === 'error'
            ? 'bg-red-500/20 text-red-400'
            : needsNsnFirst
            ? 'bg-zinc-500/10 text-gray-400 dark:text-zinc-500 opacity-50'
            : 'bg-zinc-500/10 text-gray-600 dark:text-zinc-300 hover:bg-zinc-500/20 hover:text-gray-800 dark:hover:text-white disabled:text-gray-400 disabled:dark:text-zinc-500 disabled:opacity-50'
          }
          disabled:cursor-not-allowed
          ${className}`}
        title={needsNsnFirst ? nsnRequiredMessage : message?.detail || `Get ${symbol} from Faucet`}
      >
        {loading ? (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </span>
        ) : cooldown ? (
          'Wait...'
        ) : message ? (
          message.text
        ) : (
          'Faucet'
        )}
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col">
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`px-3 py-1.5 text-sm xl:text-base font-medium rounded-lg transition-colors
          ${message?.type === 'success'
            ? 'bg-green-500/20 text-green-400'
            : message?.type === 'error'
            ? 'bg-red-500/20 text-red-400'
            : needsNsnFirst
            ? 'bg-zinc-500/10 text-gray-400 dark:text-zinc-500 opacity-50'
            : 'bg-zinc-500/10 text-gray-600 dark:text-zinc-300 hover:bg-zinc-500/20 hover:text-gray-800 dark:hover:text-white disabled:text-gray-400 disabled:dark:text-zinc-500 disabled:opacity-50'
          }
          disabled:cursor-not-allowed
          flex items-center gap-1.5
          ${className}`}
        title={needsNsnFirst ? nsnRequiredMessage : undefined}
      >
      {loading ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Requesting...</span>
        </>
      ) : cooldown ? (
        <span>Wait...</span>
      ) : message ? (
        <span>{message.text}</span>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>Faucet</span>
        </>
      )}
      </button>
      {needsNsnFirst && (
        <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-500 mt-1">
          NSN required for gas fees
        </p>
      )}
    </div>
  );
}
