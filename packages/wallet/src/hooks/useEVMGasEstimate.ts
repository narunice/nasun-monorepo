/**
 * useEVMGasEstimate Hook
 *
 * Fetches real-time gas price for EVM chains.
 * Used to display estimated transaction fees before sending.
 */

import { useQuery } from '@tanstack/react-query';
import { formatEther } from 'viem';
import { useChain } from './useChain';
import { getEVMClient } from '../core/evm/client';

/**
 * Gas estimate result
 */
export interface EVMGasEstimate {
  /** Gas price in wei */
  gasPriceWei: bigint;
  /** Gas price in gwei (human readable) */
  gasPriceGwei: string;
  /** Estimated fee for a simple transfer (21000 gas) in native token */
  estimatedTransferFee: string;
  /** Native token symbol (ETH, MATIC, etc.) */
  symbol: string;
}

/**
 * Hook options
 */
export interface UseEVMGasEstimateOptions {
  /** Enable/disable the query (default: true when on EVM chain) */
  enabled?: boolean;
  /** Refetch interval in ms (default: 15000 = 15 seconds) */
  refetchInterval?: number;
}

/**
 * Hook result
 */
export interface UseEVMGasEstimateResult {
  /** Gas estimate data */
  data: EVMGasEstimate | undefined;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => void;
}

// Standard gas limit for simple ETH transfer
const SIMPLE_TRANSFER_GAS = BigInt(21000);

/**
 * Hook for fetching real-time EVM gas estimates
 *
 * @example
 * ```tsx
 * const { data: gasEstimate, isLoading } = useEVMGasEstimate();
 *
 * if (gasEstimate) {
 *   console.log(`Transfer fee: ~${gasEstimate.estimatedTransferFee} ${gasEstimate.symbol}`);
 * }
 * ```
 */
export function useEVMGasEstimate(
  options: UseEVMGasEstimateOptions = {}
): UseEVMGasEstimateResult {
  const { chain, isEVM } = useChain();
  const { enabled = isEVM, refetchInterval = 15000 } = options;

  const query = useQuery({
    queryKey: ['evm-gas-estimate', chain.id],
    queryFn: async (): Promise<EVMGasEstimate> => {
      if (!isEVM || !chain.chainId) {
        throw new Error('Not an EVM chain');
      }

      const client = getEVMClient(chain);
      const gasPrice = await client.getGasPrice();

      // Calculate estimated fee for simple transfer
      const estimatedFeeWei = gasPrice * SIMPLE_TRANSFER_GAS;
      const estimatedFeeEther = formatEther(estimatedFeeWei);

      // Format gas price in gwei (1 gwei = 10^9 wei)
      const gasPriceGwei = (Number(gasPrice) / 1e9).toFixed(2);

      // Format estimated fee (show more decimals for small amounts)
      const feeNumber = parseFloat(estimatedFeeEther);
      const formattedFee = feeNumber < 0.0001
        ? feeNumber.toExponential(2)
        : feeNumber < 0.01
          ? feeNumber.toFixed(6)
          : feeNumber.toFixed(4);

      return {
        gasPriceWei: gasPrice,
        gasPriceGwei,
        estimatedTransferFee: formattedFee,
        symbol: chain.nativeCurrency.symbol,
      };
    },
    enabled: enabled && isEVM,
    refetchInterval,
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
