import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listBans, banAccount, unbanAccount, type BannedListResponse, type UnbanMode } from '../services/banApi';

const QUERY_KEY = ['admin', 'ecosystem-ban'];

/**
 * Loads the active banned-users list once (5 min staleTime) and exposes
 * a precomputed Set<identityId> for O(1) row-level lookups in UsersTab.
 */
export function useBannedList(cognitoToken: string | null) {
  const query = useQuery<BannedListResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => listBans(cognitoToken!),
    enabled: !!cognitoToken,
    staleTime: 5 * 60_000,
  });

  const bannedIdentityIds = new Set<string>();
  const bannedWallets = new Set<string>();
  if (query.data) {
    for (const b of query.data.bans) {
      bannedIdentityIds.add(b.identityId);
      if (b.walletAddress) bannedWallets.add(b.walletAddress.toLowerCase());
    }
  }

  return { ...query, bannedIdentityIds, bannedWallets };
}

export function useBanAccount(cognitoToken: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { identityId?: string; handle?: string; reason: string }) =>
      banAccount(cognitoToken!, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useUnbanAccount(cognitoToken: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { identityId?: string; handle?: string; reason?: string; mode?: UnbanMode }) =>
      unbanAccount(cognitoToken!, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
