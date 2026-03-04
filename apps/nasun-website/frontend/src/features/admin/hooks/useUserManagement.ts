import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listUsers, getUserDetail } from '../services/userManagementApi';
import type { ListUsersParams } from '../services/userManagementApi';

export function useUserList(cognitoToken: string | null, params: ListUsersParams = {}) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => listUsers(cognitoToken!, params),
    enabled: !!cognitoToken,
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
