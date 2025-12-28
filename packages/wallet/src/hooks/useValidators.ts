/**
 * useValidators Hook
 * Query validators for staking
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getValidators, getValidator } from '../sui/staking';
import type { ValidatorInfo } from '../types/staking';

// Query key prefix for validator queries
const VALIDATORS_QUERY_KEY = 'nasun-wallet-validators';

// Polling interval (validators don't change often)
const DEFAULT_POLLING_INTERVAL = 60_000; // 1 minute

export interface UseValidatorsOptions {
  /** Disable automatic fetching */
  enabled?: boolean;
  /** Polling interval in milliseconds (default: 60000) */
  pollingInterval?: number;
}

export interface UseValidatorsResult {
  /** List of validators */
  data: ValidatorInfo[];
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Hook to get all validators
 */
export function useValidators(options: UseValidatorsOptions = {}): UseValidatorsResult {
  const { enabled = true, pollingInterval = DEFAULT_POLLING_INTERVAL } = options;

  const query = useQuery({
    queryKey: [VALIDATORS_QUERY_KEY],
    queryFn: getValidators,
    enabled,
    refetchInterval: pollingInterval,
    staleTime: 30_000, // 30 seconds
  });

  return {
    data: query.data || [],
    isLoading: query.isLoading,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}

/**
 * Hook to get a single validator by address
 */
export function useValidator(address: string | undefined) {
  return useQuery({
    queryKey: [VALIDATORS_QUERY_KEY, address],
    queryFn: () => (address ? getValidator(address) : null),
    enabled: !!address,
    staleTime: 30_000,
  });
}

/**
 * Hook to refresh validators
 */
export function useRefreshValidators() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({
      queryKey: [VALIDATORS_QUERY_KEY],
    });
  };
}
