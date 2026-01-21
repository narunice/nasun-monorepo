/**
 * useAdminDashboard - Hook for fetching admin dashboard statistics
 *
 * Admin only - requires authentication.
 * Returns system stats, active season info, and recent activity.
 */

import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '../services/leaderboardV3Api';

const ADMIN_PASSWORD = import.meta.env.VITE_LEADERBOARD_V3_ADMIN_PASSWORD;

export function useAdminDashboard() {
  return useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: () => getDashboardStats(ADMIN_PASSWORD),
    enabled: !!ADMIN_PASSWORD,
    staleTime: 1000 * 60, // 1 minute
    gcTime: 1000 * 60 * 5, // 5 minutes
    refetchInterval: 1000 * 60 * 2, // Refetch every 2 minutes
  });
}
