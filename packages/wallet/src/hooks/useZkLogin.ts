/**
 * useZkLogin Hook
 *
 * React hook for zkLogin authentication.
 * Manages the complete zkLogin flow from OAuth to transaction signing.
 */

import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ZkLoginProvider, ZkLoginState, ZkLoginConfig } from '../types/zklogin';
import { ZkLoginError } from '../types/zklogin';
import {
  configureZkLogin,
  getZkLoginState,
  saveZkLoginState,
  clearZkLoginState,
  startZkLogin,
  completeZkLogin,
  isZkLoginSessionValid,
  disconnectZkLogin,
  signWithZkLogin,
} from '../core/zklogin';

/**
 * zkLogin hook options
 */
export interface UseZkLoginOptions {
  /** Auto-check session validity on mount */
  autoCheck?: boolean;
  /** Callback when login completes */
  onLoginComplete?: (state: ZkLoginState) => void;
  /** Callback when login fails */
  onLoginError?: (error: ZkLoginError) => void;
  /** Callback when session expires */
  onSessionExpired?: () => void;
}

/**
 * zkLogin hook return type
 */
export interface UseZkLoginResult {
  /** Current zkLogin state (null if not logged in) */
  state: ZkLoginState | null;
  /** Whether zkLogin is currently active */
  isConnected: boolean;
  /** Whether a login operation is in progress */
  isLoading: boolean;
  /** Current error (if any) */
  error: ZkLoginError | null;
  /** User info from OAuth */
  userInfo: {
    email?: string;
    name?: string;
    picture?: string;
    provider?: ZkLoginProvider;
  } | null;
  /** Start zkLogin flow with a provider */
  login: (provider: ZkLoginProvider) => Promise<void>;
  /** Complete zkLogin after OAuth callback */
  handleCallback: (jwt: string) => Promise<ZkLoginState>;
  /** Disconnect and clear all zkLogin state */
  logout: () => void;
  /** Sign transaction bytes with zkLogin */
  signTransaction: (txBytes: Uint8Array) => Promise<string>;
  /** Check if the current session is still valid */
  checkSession: () => Promise<boolean>;
  /** Refresh the current state from storage */
  refresh: () => void;
}

/**
 * Configure zkLogin (call once at app startup)
 */
export function initZkLogin(config: ZkLoginConfig): void {
  configureZkLogin(config);
}

/**
 * React hook for zkLogin authentication
 */
export function useZkLogin(options: UseZkLoginOptions = {}): UseZkLoginResult {
  const { autoCheck = true, onLoginComplete, onLoginError, onSessionExpired } = options;
  const queryClient = useQueryClient();

  // Local state for zkLogin
  const [state, setState] = useState<ZkLoginState | null>(() => getZkLoginState());
  const [error, setError] = useState<ZkLoginError | null>(null);

  // Session validity query
  const { data: isSessionValid, refetch: refetchSession } = useQuery({
    queryKey: ['zklogin', 'session-valid'],
    queryFn: isZkLoginSessionValid,
    enabled: autoCheck && !!state,
    refetchInterval: 60000, // Check every minute
    staleTime: 30000,
  });

  // Handle session expiration
  useEffect(() => {
    if (isSessionValid === false && state) {
      onSessionExpired?.();
      // Clear state when session expires
      setState(null);
      clearZkLoginState();
    }
  }, [isSessionValid, state, onSessionExpired]);

  // Login mutation (start OAuth flow)
  const loginMutation = useMutation({
    mutationFn: async (provider: ZkLoginProvider) => {
      setError(null);
      await startZkLogin(provider);
    },
    onError: (err) => {
      const zkError = err instanceof ZkLoginError
        ? err
        : new ZkLoginError('OAUTH_CANCELLED', 'Login failed');
      setError(zkError);
      onLoginError?.(zkError);
    },
  });

  // Callback handler mutation (complete OAuth flow)
  const callbackMutation = useMutation({
    mutationFn: async (jwt: string) => {
      setError(null);
      return completeZkLogin(jwt);
    },
    onSuccess: (newState) => {
      setState(newState);
      saveZkLoginState(newState);
      onLoginComplete?.(newState);
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['zklogin'] });
    },
    onError: (err) => {
      const zkError = err instanceof ZkLoginError
        ? err
        : new ZkLoginError('PROVER_FAILED', 'Login callback failed');
      setError(zkError);
      onLoginError?.(zkError);
      throw zkError;
    },
  });

  // Login function
  const login = useCallback(async (provider: ZkLoginProvider) => {
    await loginMutation.mutateAsync(provider);
  }, [loginMutation]);

  // Handle OAuth callback
  const handleCallback = useCallback(async (jwt: string): Promise<ZkLoginState> => {
    return callbackMutation.mutateAsync(jwt);
  }, [callbackMutation]);

  // Logout function
  const logout = useCallback(() => {
    disconnectZkLogin();
    setState(null);
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['zklogin'] });
  }, [queryClient]);

  // Sign transaction
  const signTransaction = useCallback(async (txBytes: Uint8Array): Promise<string> => {
    if (!state) {
      throw new ZkLoginError('SESSION_EXPIRED', 'No active zkLogin session');
    }
    if (!state.proof) {
      throw new ZkLoginError('PROVER_FAILED', 'ZK proof not available');
    }

    return signWithZkLogin({
      txBytes,
      ephemeralPrivateKey: state.ephemeralPrivateKey,
      proof: state.proof,
      maxEpoch: state.maxEpoch,
      addressSeed: state.addressSeed,
    });
  }, [state]);

  // Check session validity
  const checkSession = useCallback(async (): Promise<boolean> => {
    const result = await refetchSession();
    return result.data ?? false;
  }, [refetchSession]);

  // Refresh state from storage
  const refresh = useCallback(() => {
    const storedState = getZkLoginState();
    setState(storedState);
  }, []);

  // Derive user info from state
  const userInfo = state ? {
    email: state.email,
    name: state.name,
    picture: state.picture,
    provider: state.provider,
  } : null;

  return {
    state,
    isConnected: !!state && !!state.proof,
    isLoading: loginMutation.isPending || callbackMutation.isPending,
    error,
    userInfo,
    login,
    handleCallback,
    logout,
    signTransaction,
    checkSession,
    refresh,
  };
}

/**
 * Hook to check if we're in an OAuth callback
 * Useful for detecting redirect from OAuth provider
 */
export function useZkLoginCallback(): {
  isCallback: boolean;
  jwt: string | null;
  error: string | null;
} {
  const [result, setResult] = useState<{
    isCallback: boolean;
    jwt: string | null;
    error: string | null;
  }>({
    isCallback: false,
    jwt: null,
    error: null,
  });

  useEffect(() => {
    // Check URL hash for id_token (Google returns token in hash)
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const idToken = params.get('id_token');
      const error = params.get('error');
      const errorDescription = params.get('error_description');

      if (idToken) {
        setResult({
          isCallback: true,
          jwt: idToken,
          error: null,
        });
        return;
      }

      if (error) {
        setResult({
          isCallback: true,
          jwt: null,
          error: errorDescription || error,
        });
        return;
      }
    }

    // Check URL search params (some providers use query params)
    const search = window.location.search;
    if (search) {
      const params = new URLSearchParams(search);
      const idToken = params.get('id_token');
      const error = params.get('error');

      if (idToken) {
        setResult({
          isCallback: true,
          jwt: idToken,
          error: null,
        });
        return;
      }

      if (error) {
        setResult({
          isCallback: true,
          jwt: null,
          error: params.get('error_description') || error,
        });
        return;
      }
    }

    setResult({
      isCallback: false,
      jwt: null,
      error: null,
    });
  }, []);

  return result;
}

/**
 * Hook to get zkLogin user info
 */
export function useZkLoginUser(): {
  address: string | null;
  email: string | null;
  name: string | null;
  picture: string | null;
  provider: ZkLoginProvider | null;
  isLoggedIn: boolean;
} {
  const state = getZkLoginState();

  if (!state) {
    return {
      address: null,
      email: null,
      name: null,
      picture: null,
      provider: null,
      isLoggedIn: false,
    };
  }

  return {
    address: state.address,
    email: state.email || null,
    name: state.name || null,
    picture: state.picture || null,
    provider: state.provider,
    isLoggedIn: true,
  };
}
