import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { getWhitelistStats } from '../services/adminApi';
import type { WhitelistStats } from '../types';

export function useWhitelistStats() {
  const { user, isAuthenticated } = useAuth();

  return useQuery<WhitelistStats>({
    queryKey: ['whitelist-stats', user?.identityId],
    queryFn: () => getWhitelistStats(user!.identityId),
    enabled: isAuthenticated && !!user?.identityId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
