/**
 * Claim All Faucet Button
 *
 * Requests all available tokens (NSN + on-chain) in a single flow.
 * NSN is always included; if NSN fails but user has gas, on-chain claims proceed.
 * Shows on devnet/testnet when at least 2 on-chain tokens are claimable.
 */

import { useState } from 'react';
import { useTokenFaucet, useNetwork, useMultiBalance } from '@nasun/wallet';

interface ClaimAllButtonProps {
  className?: string;
  onSuccess?: () => void;
  /** When true, button stays visible after claim (shows success/disabled instead of hiding). */
  persistent?: boolean;
}

export function ClaimAllButton({ className = '', onSuccess, persistent = false }: ClaimAllButtonProps) {
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

  // Only show on devnet/testnet with wallet connected
  if (!isDevnet && !isTestnet) return null;
  if (!canUseFaucet) return null;
  // In persistent mode, stay visible after claim (show disabled state instead of hiding)
  if (!persistent && claimable.length < 2) return null;

  const handleClick = async () => {
    if (isAnyLoading) return;
    setMessage(null);

    const result = await requestBatchFaucet({
      includeNative: true,
      nsnBalance,
    });

    if (result.success && result.claimed.length > 0) {
      const tokens = result.claimed.join(', ');
      setMessage({ type: 'success', text: `Received: ${tokens}` });
      onSuccess?.();
    } else if (result.failed.length > 0) {
      setMessage({ type: 'error', text: result.failed[0].error });
    } else {
      setMessage({ type: 'error', text: 'No tokens claimed' });
    }

    setTimeout(() => setMessage(null), 5000);
  };

  // Visual states:
  //   idle    -> accent pill (cyan gradient) — value-positive CTA
  //   success -> flat green confirmation (still pill-shaped, no shadow/hover)
  //   error   -> flat coral message (same shape, distinct color)
  const stateClass =
    message?.type === 'success'
      ? 'bg-green-500/20 text-green-300 border border-green-500/40'
      : message?.type === 'error'
        ? 'bg-red-500/20 text-red-300 border border-red-500/40'
        : 'bg-gradient-to-r from-pado-violet to-pado-lavender text-uju-bg shadow-[0_4px_14px_rgba(124,92,255,0.4)] hover:brightness-110 hover:shadow-[0_6px_20px_rgba(124,92,255,0.55)] hover:-translate-y-0.5 active:scale-95';

  return (
    <button
      onClick={handleClick}
      disabled={isAnyLoading || !!message || claimable.length < (persistent ? 1 : 2)}
      className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[36px] text-sm font-semibold rounded-full transition-all duration-200 ease-out
        ${stateClass}
        disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:brightness-100
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
        'Claim All Tokens'
      )}
    </button>
  );
}
