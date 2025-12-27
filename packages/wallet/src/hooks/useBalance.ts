/**
 * Nasun Wallet Balance Hook
 * TanStack Query based server state management
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBalance } from '../sui/client';
import type { BalanceInfo } from '../types';
import { useWallet } from './useWallet';

// Query key
const BALANCE_QUERY_KEY = 'wallet-balance';

// Polling interval (30 seconds)
const POLLING_INTERVAL = 30_000;

/**
 * Balance query hook
 * @param address Address to query (defaults to connected wallet address)
 * @param options Options { enabled, pollingInterval }
 */
export function useBalance(
  address?: string,
  options?: {
    enabled?: boolean;
    pollingInterval?: number;
  }
) {
  const { account, status } = useWallet();

  // Determine target address
  const targetAddress = address ?? account?.address;

  // Only query when wallet is connected and address exists
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
    staleTime: 10_000, // Use cache for 10 seconds
  });
}

/**
 * Balance refresh function
 * Use to manually refresh balance after transactions
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
 * Invalidate balance cache for specific address
 */
export function useInvalidateBalance() {
  const queryClient = useQueryClient();

  return (address: string) => {
    queryClient.invalidateQueries({
      queryKey: [BALANCE_QUERY_KEY, address],
    });
  };
}
