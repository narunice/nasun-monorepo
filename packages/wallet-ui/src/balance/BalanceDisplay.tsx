/**
 * Nasun Wallet Balance Display Component
 *
 * Displays native token balance for the selected chain:
 * - Move chains (Nasun): NASUN balance via useBalance
 * - EVM chains (Sepolia, etc.): ETH balance via useEVMBalance
 */

import {
  useBalance,
  useRefreshBalance,
  useWallet,
  usePasskey,
  useChain,
  useEVMBalance,
  getStoredEVMAddress,
} from '@nasun/wallet';

interface BalanceDisplayProps {
  // Compact mode (for header)
  compact?: boolean;
  // Custom class
  className?: string;
}

export function BalanceDisplay({ compact = false, className = '' }: BalanceDisplayProps) {
  const { status } = useWallet();
  const { isUnlocked: isPasskeyUnlocked } = usePasskey();
  const { isEVM, chain } = useChain();

  // Move balance (Nasun)
  const {
    data: moveBalance,
    isLoading: moveLoading,
    error: moveError,
    refetch: moveRefetch,
  } = useBalance();
  const refreshMoveBalance = useRefreshBalance();

  // EVM balance - only fetch when EVM chain is selected
  const storedEVMAddress = isEVM ? getStoredEVMAddress() : null;
  const evmAddressForHook: string | undefined = storedEVMAddress ?? undefined;
  const {
    balance: evmBalance,
    isLoading: evmLoading,
    error: evmError,
    refetch: evmRefetch,
  } = useEVMBalance(evmAddressForHook);

  // Wallet not connected
  if (status !== 'unlocked' && !isPasskeyUnlocked) {
    return null;
  }

  // Token symbol from chain config
  const symbol = chain.nativeCurrency.symbol;

  // EVM chain selected but no EVM wallet configured
  if (isEVM && !storedEVMAddress) {
    if (compact) {
      return (
        <div className={`flex items-center gap-1 ${className}`}>
          <span className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">No EVM wallet</span>
        </div>
      );
    }
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
          EVM wallet not configured
        </span>
      </div>
    );
  }

  // Select appropriate state based on chain type
  const balance = isEVM ? evmBalance : moveBalance;
  const isLoading = isEVM ? evmLoading : moveLoading;
  const error = isEVM ? evmError : moveError;
  const refetch = isEVM ? evmRefetch : moveRefetch;
  const refresh = isEVM ? evmRefetch : refreshMoveBalance;

  // Loading state
  if (isLoading && !balance) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        {!compact && <span className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">Loading balance...</span>}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-sm xl:text-base text-red-400">Failed to load balance</span>
        <button
          onClick={() => refetch()}
          className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white underline"
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

  // Get display value based on chain type
  const displayBalance = isEVM
    ? (balance as { display: string }).display
    : (balance as { formattedBalance: string }).formattedBalance;

  // Compact mode (for header)
  if (compact) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <span className="text-sm xl:text-base font-medium text-gray-900 dark:text-white">{displayBalance}</span>
        <span className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">{symbol}</span>
      </div>
    );
  }

  // Full mode
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900 dark:text-white">{displayBalance}</span>
        <span className="text-sm xl:text-base text-blue-400 font-medium">{symbol}</span>
      </div>

      <div className="flex items-center gap-3 text-xs xl:text-sm text-gray-500 dark:text-zinc-400">
        {/* Only show coin count for Move chains */}
        {!isEVM && (balance as { coinCount?: number }).coinCount !== undefined && (
          <span>{(balance as { coinCount: number }).coinCount} coin objects</span>
        )}
        <button
          onClick={() => refresh()}
          className="hover:text-gray-900 dark:hover:text-white transition-colors flex items-center gap-1"
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
