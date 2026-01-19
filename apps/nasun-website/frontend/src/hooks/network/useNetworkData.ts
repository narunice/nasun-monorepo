import { useQuery } from '@tanstack/react-query';
import { getEpochInfo, getTPS } from '../../lib/sui-client';

/**
 * Hook for fetching epoch information
 */
export function useEpochInfo() {
  return useQuery({
    queryKey: ['epochInfo'],
    queryFn: getEpochInfo,
    refetchInterval: 5000,
    staleTime: 4000,
  });
}

/**
 * Hook for fetching current TPS
 */
export function useTPS() {
  return useQuery({
    queryKey: ['tps'],
    queryFn: getTPS,
    refetchInterval: 10000,
    staleTime: 8000,
  });
}
