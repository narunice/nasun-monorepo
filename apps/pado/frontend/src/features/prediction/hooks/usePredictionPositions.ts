/**
 * usePredictionPositions Hook
 * Fetches user's prediction market positions (Position NFTs)
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@nasun/wallet';
import type { SuiObjectResponse } from '@mysten/sui/client';
import { getSuiClient } from '../../../lib/sui-client';
import { POSITION_TYPE, NUSDC_DECIMALS } from '../constants';
import type { Position } from '../types';

/**
 * Parse Position object from Sui response
 */
function parsePosition(obj: SuiObjectResponse): Position {
  const data = obj.data;
  const content = data?.content;
  const fields = content && 'fields' in content ? (content.fields as Record<string, unknown>) : undefined;

  return {
    id: data?.objectId || '',
    marketId: (fields?.market_id as string) || '',
    isYes: (fields?.is_yes as boolean) ?? true,
    shares: BigInt((fields?.shares as string | number) || 0),
    costBasis: BigInt((fields?.cost_basis as string | number) || 0),
  };
}

/**
 * Format amount from smallest units to display units
 */
export function formatPositionAmount(amount: bigint): string {
  const divisor = BigInt(10 ** NUSDC_DECIMALS);
  const whole = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionStr = fraction.toString().padStart(NUSDC_DECIMALS, '0');
  const trimmedFraction = fractionStr.replace(/0+$/, '');
  return `${whole}.${trimmedFraction}`;
}

export interface UsePredictionPositionsResult {
  positions: Position[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch user's prediction market positions
 * @param marketId - Optional market ID to filter positions
 */
export function usePredictionPositions(marketId?: string): UsePredictionPositionsResult {
  const { status, account } = useWallet();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['prediction-positions', account?.address, marketId],
    queryFn: async (): Promise<Position[]> => {
      if (!account?.address) return [];

      const client = getSuiClient();
      const response = await client.getOwnedObjects({
        owner: account.address,
        filter: { StructType: POSITION_TYPE },
        options: { showContent: true },
      });

      const positions = response.data.map(parsePosition);

      // Filter by market if specified
      if (marketId) {
        return positions.filter(p => p.marketId === marketId);
      }
      return positions;
    },
    enabled: status === 'unlocked' && !!account?.address,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  return {
    positions: data || [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to get total position value for a market
 */
export function usePositionValue(positions: Position[], currentPrice: number): {
  totalShares: bigint;
  totalCost: bigint;
  currentValue: bigint;
  pnl: bigint;
  pnlPercent: number;
} {
  const totalShares = positions.reduce((sum, p) => sum + p.shares, 0n);
  const totalCost = positions.reduce((sum, p) => sum + p.costBasis, 0n);

  // Current value = shares * currentPrice (price is in basis points, so divide by 10000)
  const currentValue = (totalShares * BigInt(Math.floor(currentPrice * 100))) / 10000n;

  const pnl = currentValue - totalCost;
  const pnlPercent = totalCost > 0n
    ? Number((pnl * 10000n) / totalCost) / 100
    : 0;

  return {
    totalShares,
    totalCost,
    currentValue,
    pnl,
    pnlPercent,
  };
}
