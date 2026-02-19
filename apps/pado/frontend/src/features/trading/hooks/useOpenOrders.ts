/**
 * useOpenOrders Hook
 * Fetches open orders for a BalanceManager.
 * Balance is fetched separately via useBalanceManagerBalance.
 */

import { useQuery } from '@tanstack/react-query';
import { getOpenOrders, type OpenOrder } from '../../../lib/deepbook';
import { useMarket } from '../context/MarketContext';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';

export interface OpenOrdersData {
  orders: OpenOrder[];
}

/**
 * Fetch open orders for a BalanceManager
 * @param balanceManagerId BalanceManager ID (null disables query)
 * @param refetchInterval Polling interval (default 10s)
 */
export function useOpenOrders(
  balanceManagerId: string | null,
  refetchInterval = 10000,
) {
  const { currentPool, currentMarket } = useMarket();
  const adaptiveInterval = useAdaptiveInterval(refetchInterval);

  return useQuery<OpenOrdersData>({
    queryKey: ['openOrders', balanceManagerId, currentMarket],
    queryFn: async () => {
      if (!balanceManagerId) {
        return { orders: [] };
      }
      const orders = await getOpenOrders(balanceManagerId, currentPool);
      return { orders };
    },
    enabled: !!balanceManagerId,
    refetchInterval: adaptiveInterval,
    staleTime: 5000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 3000),
  });
}
