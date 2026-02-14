/**
 * useAdminDashboard - Hook for fetching admin dashboard statistics
 *
 * Admin only - requires Cognito JWT authentication.
 * Returns system stats, active season info, and recent activity.
 */

import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '../services/leaderboardV3Api';
import { useAdminAuth } from './useAdminAuth';

export function useAdminDashboard() {
  const { cognitoToken } = useAdminAuth();

  return useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: () => getDashboardStats(cognitoToken!),
    enabled: !!cognitoToken,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: 1000 * 60 * 2, // Refetch every 2 minutes
  });
}
