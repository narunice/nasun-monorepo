import { useQuery } from '@tanstack/react-query';
import { fetchDevnetMetrics } from '../services/devnetMetricsApi';
import { useAdminAuth } from './useAdminAuth';

export function useDevnetMetrics() {
  const { cognitoToken } = useAdminAuth();

  return useQuery({
    queryKey: ['admin-devnet-metrics'],
    queryFn: () => fetchDevnetMetrics(cognitoToken!),
    enabled: !!cognitoToken,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
