/**
 * Nasun Wallet 잔액 조회 훅
 * TanStack Query 기반 서버 상태 관리
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBalance } from '../lib/sui-client';
import type { BalanceInfo } from '../types/wallet';
import { useWallet } from './useWallet';

// 쿼리 키
const BALANCE_QUERY_KEY = 'wallet-balance';

// 폴링 간격 (30초)
const POLLING_INTERVAL = 30_000;

/**
 * 잔액 조회 훅
 * @param address 조회할 주소 (없으면 현재 연결된 지갑 주소)
 * @param options 옵션 { enabled, pollingInterval }
 */
export function useBalance(
  address?: string,
  options?: {
    enabled?: boolean;
    pollingInterval?: number;
  }
) {
  const { account, status } = useWallet();

  // 조회할 주소 결정
  const targetAddress = address ?? account?.address;

  // 지갑이 연결되어 있고 주소가 있을 때만 조회
  const isEnabled = options?.enabled !== false && !!targetAddress && status === 'unlocked';

  return useQuery<BalanceInfo>({
    queryKey: [BALANCE_QUERY_KEY, targetAddress],
    queryFn: async () => {
      if (!targetAddress) {
        throw new Error('No address provided');
      }
      return getBalance(targetAddress);
    },
    enabled: isEnabled,
    refetchInterval: options?.pollingInterval ?? POLLING_INTERVAL,
    staleTime: 10_000, // 10초 동안은 캐시 사용
  });
}

/**
 * 잔액 갱신 함수
 * 트랜잭션 후 수동으로 잔액을 갱신할 때 사용
 */
export function useRefreshBalance() {
  const queryClient = useQueryClient();
  const { account } = useWallet();

  return async () => {
    if (account?.address) {
      await queryClient.invalidateQueries({
        queryKey: [BALANCE_QUERY_KEY, account.address],
      });
    }
  };
}

/**
 * 특정 주소의 잔액 캐시 무효화
 */
export function useInvalidateBalance() {
  const queryClient = useQueryClient();

  return (address: string) => {
    queryClient.invalidateQueries({
      queryKey: [BALANCE_QUERY_KEY, address],
    });
  };
}
