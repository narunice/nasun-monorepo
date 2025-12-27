/**
 * Multi-Token Balance Hook
 * TanStack Query based multi-token balance management
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllBalances } from '../sui/client';
import type { MultiTokenBalanceInfo, TokenBalance } from '../types';
import { useWallet } from './useWallet';

// Query key
const MULTI_BALANCE_QUERY_KEY = 'wallet-multi-balance';

// Default polling interval (10 seconds for multi-token)
const DEFAULT_POLLING_INTERVAL = 10_000;

export interface UseMultiBalanceOptions {
  address?: string;
  enabled?: boolean;
  pollingInterval?: number;
}

/**
 * Multi-token balance query hook
 * @param options Options { address, enabled, pollingInterval }
 */
export function useMultiBalance(options?: UseMultiBalanceOptions) {
  const { account, status } = useWallet();

  // Determine target address
  const targetAddress = options?.address ?? account?.address;

  // Only query when wallet is connected and address exists
  const isEnabled = options?.enabled !== false && !!targetAddress && status === 'unlocked';

  return useQuery<MultiTokenBalanceInfo>({
    queryKey: [MULTI_BALANCE_QUERY_KEY, targetAddress],
    queryFn: async () => {
      if (!targetAddress) {
        throw new Error('No address provided');
      }
      return getAllBalances(targetAddress);
    },
    enabled: isEnabled,
    refetchInterval: options?.pollingInterval ?? DEFAULT_POLLING_INTERVAL,
    staleTime: 5_000, // Use cache for 5 seconds
  });
}

/**
 * Get specific token balance from multi-balance data
 * @param symbol Token symbol (e.g., 'NASUN', 'NBTC')
 * @param address Optional address (uses connected wallet if not provided)
 */
export function useTokenBalance(symbol: string, address?: string): TokenBalance | undefined {
  const { data: multiBalance } = useMultiBalance({ address });

  if (!multiBalance) return undefined;

  // Check if it's native token
  if (symbol === 'NASUN') {
    return multiBalance.native;
  }

  // Check in additional tokens
  return multiBalance.tokens[symbol];
}

/**
 * Get native token balance only
 * Convenience hook for NASUN balance
 */
export function useNativeBalance(address?: string): TokenBalance | undefined {
  const { data: multiBalance } = useMultiBalance({ address });
  return multiBalance?.native;
}

/**
 * Refresh all balances
 */
export function useRefreshMultiBalance() {
  const queryClient = useQueryClient();
  const { account } = useWallet();

  return async () => {
    if (account?.address) {
      await queryClient.invalidateQueries({
        queryKey: [MULTI_BALANCE_QUERY_KEY, account.address],
      });
    }
  };
}

/**
 * Invalidate multi-balance cache for specific address
 */
export function useInvalidateMultiBalance() {
  const queryClient = useQueryClient();

  return (address: string) => {
    queryClient.invalidateQueries({
      queryKey: [MULTI_BALANCE_QUERY_KEY, address],
    });
  };
}
