import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBannedAccounts, banAccountApi, unbanAccountApi } from '../services/leaderboardV3Api';

export function useBlacklist(token: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'blacklist'],
    queryFn: () => getBannedAccounts(token!),
    enabled: !!token,
    staleTime: 60_000, // 1 minute
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'blacklist'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard-v3'] });
  };

  const banMutation = useMutation({
    mutationFn: (params: { accountId: string; reason?: string }) =>
      banAccountApi(token!, params.accountId, params.reason),
    onSuccess: invalidateAll,
  });

  const unbanMutation = useMutation({
    mutationFn: (accountId: string) => unbanAccountApi(token!, accountId),
    onSuccess: invalidateAll,
  });

  return {
    bannedAccounts: query.data?.accounts || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    error: query.error,
    ban: banMutation.mutateAsync,
    unban: unbanMutation.mutateAsync,
    isBanning: banMutation.isPending,
    isUnbanning: unbanMutation.isPending,
    refetch: query.refetch,
  };
}
