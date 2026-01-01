/**
 * useLendingPool Hook
 * Fetches and manages lending pool state
 */

import { useQuery } from '@tanstack/react-query';
import { getLendingPool, calculatePoolStats } from '../lib/lending-client';
import { type LendingPool, type PoolStats } from '../types/lending';

interface UseLendingPoolResult {
  pool: LendingPool | null;
  stats: PoolStats | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useLendingPool(): UseLendingPoolResult {
  const {
    data: pool,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['lending-pool'],
    queryFn: getLendingPool,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 10000,
  });

  const stats = pool ? calculatePoolStats(pool) : null;

  return {
    pool: pool ?? null,
    stats,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
