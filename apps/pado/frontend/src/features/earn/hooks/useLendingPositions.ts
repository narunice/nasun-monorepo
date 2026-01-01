/**
 * useLendingPositions Hook
 * Fetches user's lending positions
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@nasun/wallet';
import {
  getUserPositions,
  calculatePositionValue,
} from '../lib/lending-client';
import { useLendingPool } from './useLendingPool';
import {
  type PositionValue,
  formatNUSDC,
} from '../types/lending';

interface UseLendingPositionsResult {
  positions: PositionValue[];
  totalDeposited: bigint;
  totalEarned: bigint;
  formattedTotalDeposited: string;
  formattedTotalEarned: string;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useLendingPositions(): UseLendingPositionsResult {
  const { account } = useWallet();
  const { pool } = useLendingPool();

  const {
    data: rawPositions,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['lending-positions', account?.address],
    queryFn: () => getUserPositions(account!.address),
    enabled: !!account?.address,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // Calculate position values with interest
  const positions: PositionValue[] = (rawPositions || []).map(position => {
    const currentValue = pool
      ? calculatePositionValue(position, pool.supplyIndex)
      : position.shares;
    const earnedInterest = currentValue - position.shares;

    return {
      position,
      currentValue,
      earnedInterest,
    };
  });

  // Calculate totals
  const totalDeposited = positions.reduce(
    (sum, p) => sum + p.position.shares,
    0n
  );
  const totalEarned = positions.reduce(
    (sum, p) => sum + p.earnedInterest,
    0n
  );

  return {
    positions,
    totalDeposited,
    totalEarned,
    formattedTotalDeposited: formatNUSDC(totalDeposited),
    formattedTotalEarned: formatNUSDC(totalEarned),
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
