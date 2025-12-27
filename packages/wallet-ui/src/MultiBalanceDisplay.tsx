/**
 * Nasun Wallet Multi-Token Balance Display Component
 */

import {
  useMultiBalance,
  useRefreshMultiBalance,
  useWallet,
  type TokenBalance,
} from '@nasun/wallet';

interface MultiBalanceDisplayProps {
  // Only show specific tokens (default: all registered tokens)
  tokens?: string[];
  // Compact mode (for header)
  compact?: boolean;
  // Custom class
  className?: string;
  // Show native token (NASUN)
  showNative?: boolean;
}

export function MultiBalanceDisplay({
  tokens,
  compact = false,
  className = '',
  showNative = true,
}: MultiBalanceDisplayProps) {
  const { status } = useWallet();
  const { data: balances, isLoading, error, refetch } = useMultiBalance();
  const refreshBalance = useRefreshMultiBalance();

  // Wallet not connected
  if (status !== 'unlocked') {
    return null;
  }

  // Loading state
  if (isLoading && !balances) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
        {!compact && <span className="text-sm text-zinc-400">Loading balances...</span>}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-sm text-red-400">Failed to load balances</span>
        <button
          onClick={() => refetch()}
          className="text-xs text-zinc-400 hover:text-white underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // No balances
  if (!balances) {
    return null;
  }

  // Filter tokens to display
  const tokensToShow: TokenBalance[] = [];

  if (showNative) {
    tokensToShow.push(balances.native);
  }

  // Add additional tokens
  if (tokens) {
    // Only show specified tokens
    for (const symbol of tokens) {
      if (symbol === 'NASUN') continue; // Already added if showNative
      const tokenBalance = balances.tokens[symbol];
      if (tokenBalance) {
        tokensToShow.push(tokenBalance);
      }
    }
  } else {
    // Show all registered tokens
    Object.values(balances.tokens).forEach((tokenBalance) => {
      tokensToShow.push(tokenBalance);
    });
  }

  // Compact mode (for header)
  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {tokensToShow.map((token) => (
          <div key={token.symbol} className="flex items-center gap-1">
            <span className="text-sm font-medium text-white">{token.formatted}</span>
            <span className="text-xs text-yellow-500">{token.symbol}</span>
          </div>
        ))}
      </div>
    );
  }

  // Full mode
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {tokensToShow.map((token) => (
        <div key={token.symbol} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-white">{token.formatted}</span>
            <span className="text-sm text-yellow-500 font-medium">{token.symbol}</span>
          </div>
        </div>
      ))}

      <button
        onClick={() => refreshBalance()}
        className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1 self-start"
        title="Refresh balances"
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
  );
}
