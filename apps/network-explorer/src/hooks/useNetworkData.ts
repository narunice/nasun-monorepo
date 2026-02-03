import { useQuery } from '@tanstack/react-query';
import {
  getNetworkStatus,
  getRecentTransactions,
  getEpochInfo,
  getTPS,
} from '../lib/sui-client';

/**
 * Hook for fetching network status data
 */
export function useNetworkStatus() {
  return useQuery({
    queryKey: ['networkStatus'],
    queryFn: getNetworkStatus,
    refetchInterval: 5000,
    staleTime: 4000,
  });
}

/**
 * Hook for fetching epoch information
 * Epoch data changes slowly — 30s interval is sufficient
 */
export function useEpochInfo() {
  return useQuery({
    queryKey: ['epochInfo'],
    queryFn: getEpochInfo,
    refetchInterval: 30000,
    staleTime: 25000,
  });
}

/**
 * Hook for fetching current TPS
 */
export function useTPS() {
  return useQuery({
    queryKey: ['tps'],
    queryFn: getTPS,
    refetchInterval: 12000,
    staleTime: 10000,
  });
}

/**
 * Hook for fetching recent transactions
 */
export function useRecentTransactions(limit: number = 10) {
  return useQuery({
    queryKey: ['recentTransactions', limit],
    queryFn: () => getRecentTransactions(limit),
    refetchInterval: 8000,
    staleTime: 6000,
  });
}
