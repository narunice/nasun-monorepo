/**
 * useECR - React Query hook for fetching ExecutionComplianceRecord
 */

import { useQuery } from '@tanstack/react-query';
import { fetchECRByRequestId, type ECRData } from '../services/ecrService';

interface UseECRReturn {
  ecr: ECRData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useECR(requestId: number | undefined): UseECRReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ecr', requestId],
    queryFn: () => fetchECRByRequestId(requestId!),
    enabled: requestId !== undefined,
    staleTime: 60_000, // ECR is immutable, cache for 1 minute
    retry: 1,
  });

  return {
    ecr: data ?? null,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch ECR') : null,
    refetch,
  };
}
