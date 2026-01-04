/**
 * useBalanceManagerBalance
 *
 * React Query hook for BalanceManager balance
 * Polls on-chain BalanceManager to get current base/quote balances
 *
 * @version 0.1.0
 */

import { useQuery } from '@tanstack/react-query';
import { getBalanceManagerBalances, type BalanceManagerBalance } from '../../../lib/deepbook';
import { useMarket } from '../context/MarketContext';

// Storage key for BalanceManager ID
const BALANCE_MANAGER_KEY = 'pado_balance_manager';

function getStoredBalanceManagerId(): string | null {
  try {
    return localStorage.getItem(BALANCE_MANAGER_KEY);
  } catch {
    return null;
  }
}

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
}): UseBalanceManagerBalanceResult {
  const { refetchInterval = 5000, enabled = true } = options ?? {};
  const { currentPool } = useMarket();
  const balanceManagerId = getStoredBalanceManagerId();

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
    refetchInterval,
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
