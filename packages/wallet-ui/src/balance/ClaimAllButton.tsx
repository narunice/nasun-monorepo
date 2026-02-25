/**
 * Claim All Faucet Button
 *
 * Requests all available on-chain tokens in a single PTB to avoid gas coin contention.
 * Optionally requests NSN first if the user has no gas.
 * Shows on devnet/testnet when at least 2 on-chain tokens are claimable.
 */

import { useState } from 'react';
import { useTokenFaucet, useNetwork, useMultiBalance } from '@nasun/wallet';

interface ClaimAllButtonProps {
  className?: string;
}

export function ClaimAllButton({ className = '' }: ClaimAllButtonProps) {
  const { isDevnet, isTestnet } = useNetwork();
  const {
    requestBatchFaucet,
    isAnyLoading,
    getClaimableTokens,
    canUseFaucet,
  } = useTokenFaucet();
  const { data: balances } = useMultiBalance({});
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const claimable = getClaimableTokens();
  const nsnBalance = balances?.native?.balance ?? 0n;

  // Only show on devnet/testnet, wallet connected, at least 2 on-chain tokens claimable
  if (!isDevnet && !isTestnet) return null;
  if (!canUseFaucet) return null;
  if (claimable.length < 2) return null;

  const handleClick = async () => {
    if (isAnyLoading) return;
    setMessage(null);

    const result = await requestBatchFaucet({
      includeNative: nsnBalance === 0n,
    });

    if (result.success && result.claimed.length > 0) {
      const tokens = result.claimed.join(', ');
      setMessage({ type: 'success', text: `Received: ${tokens}` });
    } else if (result.failed.length > 0) {
      setMessage({ type: 'error', text: result.failed[0].error });
    } else {
      setMessage({ type: 'error', text: 'No tokens claimed' });
    }

    setTimeout(() => setMessage(null), 5000);
  };

  return (
    <button
      onClick={handleClick}
      disabled={isAnyLoading || claimable.length < 2}
      className={`w-full py-1.5 text-xs xl:text-sm font-medium rounded-md transition-colors
        ${
          message?.type === 'success'
            ? 'bg-green-500/20 text-green-400'
            : message?.type === 'error'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 hover:text-blue-300'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}`}
    >
      {isAnyLoading ? (
        <span className="flex items-center justify-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Claiming...
        </span>
      ) : message ? (
        message.text
      ) : (
        `Claim All (${claimable.length} tokens)`
      )}
    </button>
  );
}
