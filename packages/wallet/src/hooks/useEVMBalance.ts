/**
 * useEVMBalance Hook
 *
 * Fetches and caches EVM native token balance.
 * Automatically refetches on chain or address changes.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { useChain } from './useChain';
import { getEVMClient } from '../core/evm/client';

/**
 * EVM balance data
 */
export interface EVMBalance {
  /** Raw balance in wei */
  raw: bigint;
  /** Formatted balance with full precision */
  formatted: string;
  /** Balance with limited decimals for display */
  display: string;
  /** Native currency symbol */
  symbol: string;
  /** Native currency decimals */
  decimals: number;
}

/**
 * Result of useEVMBalance hook
 */
export interface UseEVMBalanceResult {
  /** Balance data (null if not available) */
  balance: EVMBalance | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch balance */
  refetch: () => void;
}

/**
 * Hook to fetch EVM native token balance
 *
 * @param address - EVM address to check balance for
 * @returns Balance data and query state
 *
 * @example
 * ```tsx
 * const { balance, isLoading } = useEVMBalance(address);
 *
 * if (isLoading) return <Spinner />;
 * if (!balance) return <span>-</span>;
 *
 * return <span>{balance.display} {balance.symbol}</span>;
 * ```
 */
export function useEVMBalance(address?: string): UseEVMBalanceResult {
  const { chain, isEVM } = useChain();
  const queryClient = useQueryClient();

  const {
    data: balance,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['evm-balance', chain.id, address],
    queryFn: async (): Promise<EVMBalance | null> => {
      if (!isEVM || !address || !chain.chainId) {
        return null;
      }

      // Validate address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return null;
      }

      try {
        const client = getEVMClient(chain);
        const rawBalance = await client.getBalance({
          address: address as `0x${string}`,
        });

        const { decimals, symbol } = chain.nativeCurrency;
        const formatted = formatUnits(rawBalance, decimals);

        // Create display string with max 6 decimal places
        const displayDecimals = Math.min(6, decimals);
        const display = parseFloat(formatted).toFixed(displayDecimals);

        return {
          raw: rawBalance,
          formatted,
          display,
          symbol,
          decimals,
        };
      } catch (err) {
        throw err;
      }
    },
    enabled: isEVM && !!address,
    staleTime: 10_000, // 10 seconds
    refetchInterval: 30_000, // 30 seconds
  });

  const refetchBalance = () => {
    queryClient.invalidateQueries({
      queryKey: ['evm-balance', chain.id, address],
    });
    refetch();
  };

  return {
    balance: balance ?? null,
    isLoading,
    error: error as Error | null,
    refetch: refetchBalance,
  };
}

/**
 * Hook to manually refresh all EVM balances
 */
export function useRefreshEVMBalance() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({
      queryKey: ['evm-balance'],
    });
  };
}