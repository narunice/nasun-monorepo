import { useQuery } from '@tanstack/react-query';
import { fetchUserAnalytics } from '../services/userAnalyticsApi';
import { useAdminAuth } from './useAdminAuth';

export function useUserAnalytics() {
  const { cognitoToken } = useAdminAuth();

  return useQuery({
    queryKey: ['admin-user-analytics'],
    queryFn: () => fetchUserAnalytics(cognitoToken!),
    enabled: !!cognitoToken,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
