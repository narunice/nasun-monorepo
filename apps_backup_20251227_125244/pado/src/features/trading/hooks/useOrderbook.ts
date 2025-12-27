/**
 * useOrderbook Hook
 * React Query를 사용한 오더북 데이터 페칭
 */

import { useQuery } from '@tanstack/react-query';
import { getOrderbook, getPoolMidPrice, type Orderbook } from '../../../lib/deepbook';
import { useMarket } from '../context/MarketContext';

export interface OrderbookData {
  orderbook: Orderbook;
  midPrice: number;
}

/**
 * 오더북 및 미드프라이스 페칭
 * @param refetchInterval 갱신 간격 (기본 5초)
 */
export function useOrderbook(refetchInterval = 5000) {
  const { currentPool, currentMarket } = useMarket();

  return useQuery<OrderbookData>({
    queryKey: ['orderbook', currentMarket],
    queryFn: async () => {
      const [orderbook, midPrice] = await Promise.all([
        getOrderbook(currentPool),
        getPoolMidPrice(currentPool),
      ]);
      return { orderbook, midPrice };
    },
    refetchInterval,
    staleTime: 2000,
  });
}
