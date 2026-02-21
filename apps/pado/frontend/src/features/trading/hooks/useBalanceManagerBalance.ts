/**
 * useBalanceManagerBalance
 *
 * React Query hook for BalanceManager balance
 * Polls on-chain BalanceManager to get current base/quote balances
 *
 * @version 0.1.0
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { getBalanceManagerBalances, type BalanceManagerBalance } from '../../../lib/deepbook';
import { getStoredBalanceManagerId } from '../../../lib/unified-margin';
import { useMarket } from '../context/MarketContext';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';

interface UseBalanceManagerBalanceResult {
  balance: BalanceManagerBalance | null;
  isLoading: boolean;
  error: Error | null;
  balanceManagerId: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch BalanceManager balance
 *
 * @param options - Query options
 * @param options.refetchInterval - Polling interval in ms (default: 5000)
 * @param options.enabled - Enable/disable the query
 */
export function useBalanceManagerBalance(options?: {
  refetchInterval?: number;
  enabled?: boolean;
  balanceManagerId?: string | null;
}): UseBalanceManagerBalanceResult {
  const { refetchInterval = 5000, enabled = true, balanceManagerId: externalId } = options ?? {};
  const adaptiveInterval = useAdaptiveInterval(refetchInterval);
  const { currentPool } = useMarket();

  // Use externally-validated balanceManagerId when provided (avoids stale localStorage reads).
  // Falls back to localStorage lookup for backward compatibility.
  const { account: walletAccount, status } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const activeAddress = isZkLoggedIn
    ? zkState?.address
    : status === 'unlocked'
      ? walletAccount?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

  const balanceManagerId = externalId !== undefined
    ? externalId
    : activeAddress ? getStoredBalanceManagerId(activeAddress) : null;

  const {
    data: balance,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['balance-manager-balance', balanceManagerId, currentPool.id],
    queryFn: async (): Promise<BalanceManagerBalance | null> => {
      if (!balanceManagerId) return null;
      return getBalanceManagerBalances(balanceManagerId, currentPool);
    },
    refetchInterval: adaptiveInterval,
    enabled: enabled && !!balanceManagerId,
    staleTime: 2000,
  });

  return {
    balance: balance ?? null,
    isLoading,
    error: error as Error | null,
    balanceManagerId,
    refetch,
  };
}
