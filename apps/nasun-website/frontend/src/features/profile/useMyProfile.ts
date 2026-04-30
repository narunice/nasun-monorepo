/**
 * useMyProfile — authenticated own-profile hook (nasun-website only).
 *
 * Reads via Lambda GET /user-profile?identityId=... + Bearer JWT, returns
 * EcosystemProfile. Provides mutations for display-name + avatar updates that
 * write the response back into the react-query cache so any component
 * subscribed to the same key gets the new value immediately.
 *
 * Other Nasun ecosystem apps consume only `useProfile(walletAddress)` from
 * `@nasun/profile-react` — they do not import this hook.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { EcosystemProfile } from '@nasun/profile-core';
import { useUserStore } from '@/store/userStore';
import {
  getMyProfile,
  patchProfile,
  UserProfileApiError,
} from '@/services/userProfileApi';

const FIVE_MIN = 5 * 60 * 1000;

export interface UseMyProfileResult {
  query: UseQueryResult<EcosystemProfile | null>;
  /** Convenience accessors (resolve null/undefined). */
  data: EcosystemProfile | null | undefined;
  isLoading: boolean;
  isFetched: boolean;
  /** Mutate display name. Returns the unified profile on success. */
  updateName: UseMutationResult<EcosystemProfile, Error, string>;
  /** Mutate avatar key (null clears it). */
  updateAvatarKey: UseMutationResult<EcosystemProfile, Error, string | null>;
}

function profileQueryKey(identityId: string | undefined) {
  return ['ecosystem', 'profile', 'me', identityId ?? null] as const;
}

export function useMyProfile(): UseMyProfileResult {
  const user = useUserStore((s) => s.user);
  const setUser = useUserStore((s) => s.setUser);
  const queryClient = useQueryClient();

  const identityId = user?.identityId;
  const token = user?.cognitoToken;
  const enabled = !!identityId && !!token;

  const query = useQuery<EcosystemProfile | null>({
    queryKey: profileQueryKey(identityId),
    queryFn: () => getMyProfile(token!, identityId!),
    enabled,
    staleTime: FIVE_MIN,
    refetchOnWindowFocus: 'always',
    // Auth errors are terminal — don't retry; AuthProvider will handle re-auth.
    retry: (n, err: unknown) => {
      const status = (err as UserProfileApiError | undefined)?.statusCode;
      if (status === 401 || status === 403) return false;
      return n < 2;
    },
  });

  const updateName = useMutation<EcosystemProfile, Error, string>({
    mutationFn: (displayName) => patchProfile(token!, { displayName }),
    onSuccess: (profile) => {
      queryClient.setQueryData(profileQueryKey(identityId), profile);
      // Mirror the customDisplayName into zustand store so legacy consumers
      // (still reading from useUserStore) see the update immediately.
      if (user) {
        setUser({ ...user, customDisplayName: profile.customDisplayName });
      }
    },
  });

  const updateAvatarKey = useMutation<EcosystemProfile, Error, string | null>({
    mutationFn: (key) => patchProfile(token!, { avatarKey: key }),
    onSuccess: (profile) => {
      queryClient.setQueryData(profileQueryKey(identityId), profile);
      if (user) {
        setUser({
          ...user,
          customAvatarKey: profile.customAvatarKey,
          customAvatarBanned: profile.customAvatarBanned,
        });
      }
    },
  });

  return {
    query,
    data: query.data,
    isLoading: query.isLoading,
    isFetched: query.isFetched,
    updateName,
    updateAvatarKey,
  };
}
