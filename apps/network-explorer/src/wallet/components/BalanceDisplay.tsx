/**
 * Nasun Wallet Balance Display Component
 */

import { useBalance, useRefreshBalance } from '../hooks/useBalance';
import { useWallet } from '../hooks/useWallet';

interface BalanceDisplayProps {
  // Compact mode (for header)
  compact?: boolean;
  // Custom class
  className?: string;
}

export function BalanceDisplay({ compact = false, className = '' }: BalanceDisplayProps) {
  const { status } = useWallet();
  const { data: balance, isLoading, error, refetch } = useBalance();
  const refreshBalance = useRefreshBalance();

  // Wallet not connected
  if (status !== 'unlocked') {
    return null;
  }

  // Loading state
  if (isLoading && !balance) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
        {!compact && <span className="text-sm text-zinc-400">Loading balance...</span>}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-sm text-red-400">Failed to load balance</span>
        <button
          onClick={() => refetch()}
          className="text-xs text-zinc-400 hover:text-white underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // No balance
  if (!balance) {
    return null;
  }

  // Compact mode (for header)
  if (compact) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <span className="text-sm font-medium text-white">{balance.formattedBalance}</span>
        <span className="text-xs text-yellow-500">NASUN</span>
      </div>
    );
  }

  // Full mode
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white">{balance.formattedBalance}</span>
        <span className="text-sm text-yellow-500 font-medium">NASUN</span>
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span>{balance.coinCount} coin objects</span>
        <button
          onClick={() => refreshBalance()}
          className="hover:text-white transition-colors flex items-center gap-1"
          title="Refresh balance"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </button>
      </div>
    </div>
  );
}
