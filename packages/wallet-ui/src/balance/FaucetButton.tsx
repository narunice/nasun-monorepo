/**
 * Nasun Wallet Faucet Button
 * Test token request UI — delegates to useTokenFaucet for proper 24h cooldown.
 */

import { useState, useCallback, useEffect } from 'react';
import { useWallet, usePasskey, useTokenFaucet } from '@nasun/wallet';

interface FaucetButtonProps {
  // Button style variant
  variant?: 'default' | 'compact';
  // Custom class
  className?: string;
  // Success callback
  onSuccess?: () => void;
}

export function FaucetButton({ variant = 'default', className = '', onSuccess }: FaucetButtonProps) {
  const { status, account } = useWallet();
  const { isUnlocked: isPasskeyUnlocked, address: passkeyAddress } = usePasskey();
  const { requestFaucet, isLoading: isTokenLoading, isCooldown, getCooldownFormatted, canUseFaucet } = useTokenFaucet();

  const faucetAddress = account?.address || passkeyAddress;

  const isLoading = isTokenLoading('NSN');
  const cooldown = isCooldown('NSN');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cooldownText, setCooldownText] = useState('');

  // Poll cooldown remaining time every 60s
  useEffect(() => {
    const update = () => setCooldownText(getCooldownFormatted('NSN'));
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [getCooldownFormatted]);

  const handleRequest = useCallback(async () => {
    if (!faucetAddress || cooldown || isLoading || !canUseFaucet) return;

    setError(null);
    setSuccess(false);

    try {
      const result = await requestFaucet('NSN');
      if (result.success) {
        setSuccess(true);
        onSuccess?.();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error || 'Faucet request failed');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Faucet request failed';
      setError(message);
      setTimeout(() => setError(null), 5000);
    }
  }, [faucetAddress, cooldown, isLoading, canUseFaucet, requestFaucet, onSuccess]);

  // Wallet not connected
  if (status !== 'unlocked' && !isPasskeyUnlocked) {
    return null;
  }

  // Compact variant
  if (variant === 'compact') {
    return (
      <button
        onClick={handleRequest}
        disabled={isLoading || cooldown}
        className={`px-3 py-1.5 text-xs xl:text-sm font-medium rounded transition-colors ${
          success
            ? 'bg-green-500/20 text-green-400 cursor-default'
            : error
            ? 'bg-red-500/20 text-red-400 cursor-default'
            : 'bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-600 dark:text-zinc-300 hover:text-gray-800 dark:hover:text-white disabled:bg-gray-100 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-zinc-500 disabled:opacity-50'
        } ${className}`}
        title={error || (success ? 'Tokens received!' : 'Get test tokens from Faucet')}
      >
        {isLoading ? (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Requesting
          </span>
        ) : cooldown ? (
          cooldownText || 'Cooldown'
        ) : success ? (
          'Received!'
        ) : error ? (
          'Failed'
        ) : (
          'Faucet'
        )}
      </button>
    );
  }

  // Default variant
  return (
    <div className={`${className}`}>
      <button
        onClick={handleRequest}
        disabled={isLoading || cooldown}
        className={`w-full px-4 py-2 font-medium rounded transition-colors ${
          success
            ? 'bg-green-500/20 text-green-400 cursor-default'
            : 'bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-600 dark:text-zinc-300 hover:text-gray-800 dark:hover:text-white disabled:bg-gray-100 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-zinc-500 disabled:opacity-50'
        }`}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Requesting tokens...
          </span>
        ) : success ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Tokens Received!
          </span>
        ) : (
          'Get Tokens from Faucet'
        )}
      </button>

      {error && (
        <p className="mt-2 text-xs xl:text-sm text-red-400 text-center">{error}</p>
      )}
    </div>
  );
}
