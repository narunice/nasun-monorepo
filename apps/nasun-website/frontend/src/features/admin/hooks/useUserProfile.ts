import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import type { UserProfile } from '../types';

const USER_PROFILE_API = import.meta.env.VITE_USER_PROFILE_API;

export async function fetchUserProfile(identityId: string): Promise<UserProfile | null> {
  if (!USER_PROFILE_API) {
    console.error('VITE_USER_PROFILE_API not configured');
    return null;
  }

  const response = await fetch(`${USER_PROFILE_API}?identityId=${encodeURIComponent(identityId)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: ${response.status}`);
  }

  return response.json();
}

export function useUserProfile() {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['userProfile', user?.identityId],
    queryFn: () => fetchUserProfile(user!.identityId),
    enabled: isAuthenticated && !!user?.identityId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
