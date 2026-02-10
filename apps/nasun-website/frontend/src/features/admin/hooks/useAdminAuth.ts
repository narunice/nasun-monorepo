import { useMemo } from 'react';
import { useAuth } from '@/features/auth';
import { useUserProfile } from './useUserProfile';
import type { AdminAuthState } from '../types';

export function useAdminAuth(): AdminAuthState {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { data: profile, isLoading: profileLoading, error } = useUserProfile();

  const isLoading = authLoading || (isAuthenticated && profileLoading);

  const isAdmin = useMemo(() => {
    if (!isAuthenticated || !profile) return false;
    return profile.role === 'ADMIN';
  }, [isAuthenticated, profile]);

  return {
    isAdmin,
    isLoading,
    error: error as Error | null,
    profile: profile ?? null,
    cognitoToken: user?.cognitoToken ?? null,
  };
}
