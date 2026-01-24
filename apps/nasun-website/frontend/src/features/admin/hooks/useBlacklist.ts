import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBannedAccounts, banAccountApi, unbanAccountApi } from '../services/leaderboardV3Api';

export function useBlacklist(adminPassword: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'blacklist'],
    queryFn: () => getBannedAccounts(adminPassword),
    enabled: !!adminPassword,
    staleTime: 60_000, // 1 minute
  });

  const banMutation = useMutation({
    mutationFn: (params: { accountId: string; reason?: string; adminUsername?: string }) =>
      banAccountApi(adminPassword, params.accountId, params.reason, params.adminUsername),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'blacklist'] }),
  });

  const unbanMutation = useMutation({
    mutationFn: (accountId: string) => unbanAccountApi(adminPassword, accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'blacklist'] }),
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
