import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listUsers, getUserDetail, searchUsers } from '../services/userManagementApi';
import type { ListUsersParams, SearchUsersParams } from '../services/userManagementApi';

export function useUserList(
  cognitoToken: string | null,
  params: ListUsersParams & { page?: number } = {},
  options: { enabled?: boolean } = {},
) {
  const { page, ...apiParams } = params;
  return useQuery({
    queryKey: ['admin', 'users', 'list', page ?? 1, apiParams],
    queryFn: () => listUsers(cognitoToken!, apiParams),
    enabled: (options.enabled ?? true) && !!cognitoToken,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useUserSearch(
  cognitoToken: string | null,
  params: SearchUsersParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['admin', 'users', 'search', params.q, params.field ?? 'auto'],
    queryFn: () => searchUsers(cognitoToken!, params),
    enabled: (options.enabled ?? true) && !!cognitoToken && params.q.trim().length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useUserDetail(cognitoToken: string | null, identityId: string | null) {
  return useQuery({
    queryKey: ['admin', 'users', 'detail', identityId],
    queryFn: () => getUserDetail(cognitoToken!, identityId!),
    enabled: !!cognitoToken && !!identityId,
    staleTime: 60_000,
  });
}
