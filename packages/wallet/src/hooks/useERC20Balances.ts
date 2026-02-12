/**
 * useERC20Balances Hook
 *
 * Fetches ERC-20 token balances for the current EVM chain.
 * Uses known + custom token registry and multicall for efficiency.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useChain } from './useChain';
import { getEVMClient } from '../core/evm/client';
import { getERC20Balances, type ERC20Balance } from '../core/evm/erc20';
import { getAllERC20Tokens } from '../config/custom-erc20-tokens';

/** Result of useERC20Balances hook */
export interface UseERC20BalancesResult {
  /** ERC-20 token balances */
  balances: ERC20Balance[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch balances */
  refetch: () => void;
}

/**
 * Hook to fetch ERC-20 token balances for the current EVM chain
 *
 * @param address - EVM address to check balances for
 * @returns ERC-20 balances and query state
 */
export function useERC20Balances(address?: string): UseERC20BalancesResult {
  const { chain, isEVM } = useChain();
  const queryClient = useQueryClient();

  const {
    data: balances,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['erc20-balances', chain.id, address],
    queryFn: async (): Promise<ERC20Balance[]> => {
      if (!isEVM || !address || !chain.chainId) {
        return [];
      }

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return [];
      }

      const tokens = getAllERC20Tokens(chain.id);
      if (tokens.length === 0) {
        return [];
      }

      const client = getEVMClient(chain);
      return getERC20Balances(client, tokens, address as `0x${string}`);
    },
    enabled: isEVM && !!address,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const refetchBalances = () => {
    queryClient.invalidateQueries({
      queryKey: ['erc20-balances', chain.id, address],
    });
    refetch();
  };

  return {
    balances: balances ?? [],
    isLoading,
    error: error as Error | null,
    refetch: refetchBalances,
  };
}

/** Hook to manually refresh all ERC-20 balances */
export function useRefreshERC20Balances() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({
      queryKey: ['erc20-balances'],
    });
  };
}
