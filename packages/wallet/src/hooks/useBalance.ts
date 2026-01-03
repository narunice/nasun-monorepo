/**
 * Nasun Wallet Balance Hook
 * TanStack Query based server state management
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBalance } from '../sui/client';
import type { BalanceInfo } from '../types';
import { useWallet } from './useWallet';
import { useZkLogin } from './useZkLogin';

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
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();

  // Determine target address (mnemonic wallet OR zkLogin)
  const targetAddress = address ?? account?.address ?? zkState?.address;

  // Enable query when mnemonic wallet unlocked OR zkLogin connected
  const isWalletConnected = status === 'unlocked' || isZkConnected;
  const isEnabled = options?.enabled !== false && !!targetAddress && isWalletConnected;

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
  const { state: zkState } = useZkLogin();

  return async () => {
    const address = account?.address ?? zkState?.address;
    if (address) {
      await queryClient.invalidateQueries({
        queryKey: [BALANCE_QUERY_KEY, address],
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
