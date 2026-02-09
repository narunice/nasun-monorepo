/**
 * useOpenOrders Hook
 * React Query를 사용한 오픈 오더 및 BalanceManager 잔고 페칭
 */

import { useQuery } from '@tanstack/react-query';
import {
  getOpenOrders,
  getBalanceManagerBalances,
  type OpenOrder,
  type BalanceManagerBalance,
} from '../../../lib/deepbook';
import { useMarket } from '../context/MarketContext';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';

export interface OpenOrdersData {
  orders: OpenOrder[];
  balance: BalanceManagerBalance;
}

/**
 * 오픈 오더 및 BalanceManager 잔고 페칭
 * @param balanceManagerId BalanceManager ID (null이면 비활성화)
 * @param refetchInterval 갱신 간격 (기본 5초)
 */
export function useOpenOrders(
  balanceManagerId: string | null,
  refetchInterval = 5000,
) {
  const { currentPool, currentMarket } = useMarket();
  const adaptiveInterval = useAdaptiveInterval(refetchInterval);

  return useQuery<OpenOrdersData>({
    queryKey: ['openOrders', balanceManagerId, currentMarket],
    queryFn: async () => {
      if (!balanceManagerId) {
        return { orders: [], balance: { base: 0, quote: 0 } };
      }

      const [orders, balance] = await Promise.all([
        getOpenOrders(balanceManagerId, currentPool),
        getBalanceManagerBalances(balanceManagerId, currentPool),
      ]);

      return { orders, balance };
    },
    enabled: !!balanceManagerId,
    refetchInterval: adaptiveInterval,
    staleTime: 2000,
    // Retry logic for RPC sync delay (newly created BM may not be indexed yet)
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 3000),
  });
}
