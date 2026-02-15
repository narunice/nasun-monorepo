/**
 * Multi-Token Balance Hook
 * TanStack Query based multi-token balance management
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllBalances } from '../sui/client';
import type { MultiTokenBalanceInfo, TokenBalance } from '../types';
import { useWallet } from './useWallet';
import { useZkLoginStore } from '../stores/zkLoginStore';
import { usePasskey } from './usePasskey';
import { useChainStore } from './useChain';
import { isNasunChain } from '../config/chains';

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
  const { state: zkState, isConnected: isZkLoggedIn } = useZkLoginStore();
  const { isUnlocked: isPasskeyUnlocked, address: passkeyAddress } = usePasskey();
  const chainId = useChainStore((s) => s.currentChainId);

  // Determine target address (local wallet, zkLogin, or passkey)
  const targetAddress = options?.address ?? account?.address ?? zkState?.address ?? passkeyAddress;

  // Only query on Nasun chains (external Move chains don't have Nasun tokens)
  const isNasun = isNasunChain(chainId);
  const isEnabled = options?.enabled !== false && !!targetAddress && (status === 'unlocked' || isZkLoggedIn || isPasskeyUnlocked) && isNasun;

  return useQuery<MultiTokenBalanceInfo>({
    queryKey: [MULTI_BALANCE_QUERY_KEY, chainId, targetAddress],
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
 * @param symbol Token symbol (e.g., 'NSN', 'NBTC')
 * @param address Optional address (uses connected wallet if not provided)
 */
export function useTokenBalance(symbol: string, address?: string): TokenBalance | undefined {
  const { data: multiBalance } = useMultiBalance({ address });

  if (!multiBalance) return undefined;

  // Check if it's native token
  if (symbol === 'NSN') {
    return multiBalance.native;
  }

  // Check in additional tokens
  return multiBalance.tokens[symbol];
}

/**
 * Get native token balance only
 * Convenience hook for NSN balance
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
  const { state: zkState } = useZkLoginStore();
  const { address: passkeyAddress } = usePasskey();
  const chainId = useChainStore((s) => s.currentChainId);

  // Use wallet address, zkLogin address, or passkey address
  const address = account?.address ?? zkState?.address ?? passkeyAddress;

  return async () => {
    if (address) {
      await queryClient.invalidateQueries({
        queryKey: [MULTI_BALANCE_QUERY_KEY, chainId, address],
      });
    }
  };
}

/**
 * Invalidate multi-balance cache for specific address
 */
export function useInvalidateMultiBalance() {
  const queryClient = useQueryClient();
  const chainId = useChainStore((s) => s.currentChainId);

  return (address: string) => {
    queryClient.invalidateQueries({
      queryKey: [MULTI_BALANCE_QUERY_KEY, chainId, address],
    });
  };
}
