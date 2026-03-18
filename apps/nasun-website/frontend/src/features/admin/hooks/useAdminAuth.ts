import { useMemo, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '@/features/auth';
import { useUserProfile } from './useUserProfile';
import { isTokenExpired } from '@/features/auth/utils/tokenUtils';
import type { AdminAuthState } from '../types';

const TOKEN_CHECK_INTERVAL_MS = 60_000; // Check every 60 seconds

export function useAdminAuth(): AdminAuthState {
  const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth();
  const { data: profile, isLoading: profileLoading, error } = useUserProfile();
  // Tick counter forces re-render so tokenExpired is re-evaluated periodically
  const [tick, setTick] = useState(0);

  const isLoading = authLoading || (isAuthenticated && profileLoading);

  const isAdmin = useMemo(() => {
    if (!isAuthenticated || !profile) return false;
    return profile.role === 'ADMIN';
  }, [isAuthenticated, profile]);

  // Only treat as expired when token EXISTS and is expired.
  // Token being absent (e.g. stripped after expiry) is not the same as expired.
  const tokenExpired = useMemo(
    () => isAuthenticated && !!user?.cognitoToken && isTokenExpired(user.cognitoToken),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAuthenticated, user?.cognitoToken, tick]
  );

  // Admin users need cognitoToken for API access.
  // Treat absent token as requiring re-auth for admin users only.
  // Non-admin users can browse with degraded (token-less) sessions.
  const tokenMissing = isAuthenticated && isAdmin && !user?.cognitoToken;

  // Prevent duplicate logout calls
  const logoutCalledRef = useRef(false);

  // Auto-logout when token expires or is missing for admin users
  useEffect(() => {
    if ((tokenExpired || tokenMissing) && !authLoading && !logoutCalledRef.current) {
      logoutCalledRef.current = true;
      toast.error('Session expired. Please log in again.', {
        autoClose: 6000,
        toastId: 'session-expired',
      });
      logout();
    }
    // Reset flag when user logs out and back in
    if (!isAuthenticated) {
      logoutCalledRef.current = false;
    }
  }, [tokenExpired, tokenMissing, authLoading, isAuthenticated, logout]);

  // Periodic token expiry check for background detection
  useEffect(() => {
    if (!isAuthenticated || !user?.cognitoToken) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, TOKEN_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isAuthenticated, user?.cognitoToken]);

  return {
    isAdmin,
    isLoading,
    error: error as Error | null,
    profile: profile ?? null,
    cognitoToken: tokenExpired ? null : (user?.cognitoToken ?? null),
  };
}
