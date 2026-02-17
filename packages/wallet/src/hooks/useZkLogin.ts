/**
 * useZkLogin Hook
 *
 * React hook for zkLogin authentication.
 * Uses Zustand store for global state synchronization.
 */

import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ZkLoginProvider, ZkLoginState, ZkLoginConfig } from '../types/zklogin';
import { ZkLoginError } from '../types/zklogin';
import {
  configureZkLogin,
  getZkLoginState,
  clearZkLoginState,
  startZkLogin,
  completeZkLogin,
  isZkLoginSessionValid,
  disconnectZkLogin,
  signWithZkLogin,
  validateOAuthCsrfState,
  clearOAuthCsrfState,
} from '../core/zklogin';
import { useZkLoginStore } from '../stores/zkLoginStore';
import { useChainStore } from './useChain';

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
 * Uses Zustand store for global state - all components share the same state
 */
export function useZkLogin(options: UseZkLoginOptions = {}): UseZkLoginResult {
  const { autoCheck = true, onLoginComplete, onLoginError, onSessionExpired } = options;
  const queryClient = useQueryClient();

  // Use Zustand store for global state
  const {
    state,
    isConnected,
    error,
    setState: setStoreState,
    clearState: clearStoreState,
    setError: setStoreError,
  } = useZkLoginStore();

  // Initialize store from sessionStorage on first mount
  useEffect(() => {
    const storedState = getZkLoginState();
    if (storedState && !state) {
      setStoreState(storedState);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      clearStoreState();
      clearZkLoginState();
    }
  }, [isSessionValid, state, onSessionExpired, clearStoreState]);

  // Login mutation (start OAuth flow)
  const loginMutation = useMutation({
    mutationFn: async (provider: ZkLoginProvider) => {
      setStoreError(null);
      await startZkLogin(provider);
    },
    onError: (err) => {
      const zkError = err instanceof ZkLoginError
        ? err
        : new ZkLoginError('OAUTH_CANCELLED', 'Login failed');
      setStoreError(zkError);
      onLoginError?.(zkError);
    },
  });

  // Callback handler mutation (complete OAuth flow)
  const callbackMutation = useMutation({
    mutationFn: async (jwt: string) => {
      setStoreError(null);
      return completeZkLogin(jwt);
    },
    onSuccess: (newState) => {
      // Update store state (completeZkLogin already saved to sessionStorage)
      setStoreState(newState);
      onLoginComplete?.(newState);
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['zklogin'] });
    },
    onError: (err) => {
      const zkError = err instanceof ZkLoginError
        ? err
        : new ZkLoginError('PROVER_FAILED', 'Login callback failed');
      setStoreError(zkError);
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
    clearStoreState();
    // Reset chain to default (Nasun Devnet) on logout
    useChainStore.getState().resetToDefault();
    queryClient.invalidateQueries({ queryKey: ['zklogin'] });
  }, [queryClient, clearStoreState]);

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
    if (storedState) {
      setStoreState(storedState);
    } else {
      clearStoreState();
    }
  }, [setStoreState, clearStoreState]);

  // Derive user info from state
  const userInfo = state ? {
    email: state.email,
    name: state.name,
    picture: state.picture,
    provider: state.provider,
  } : null;

  return {
    state,
    isConnected,
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
 * Includes CSRF state validation for security
 */
export function useZkLoginCallback(): {
  isCallback: boolean;
  jwt: string | null;
  error: string | null;
} {
  // Use Zustand store to check if we should parse callback
  const { state } = useZkLoginStore();

  // If already logged in, not a callback
  if (state?.proof) {
    return {
      isCallback: false,
      jwt: null,
      error: null,
    };
  }

  // Helper to validate CSRF state and return error if invalid
  const validateState = (receivedState: string | null): string | null => {
    if (!receivedState) {
      // State parameter is required for CSRF protection
      clearOAuthCsrfState();
      return 'Missing OAuth state parameter - possible security issue';
    }
    try {
      validateOAuthCsrfState(receivedState);
      return null; // Validation passed
    } catch (err) {
      return err instanceof Error ? err.message : 'OAuth state validation failed';
    }
  };

  // Check URL hash for id_token (Google returns token in hash)
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  if (hash) {
    const params = new URLSearchParams(hash.substring(1));
    const idToken = params.get('id_token');
    const receivedState = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (idToken) {
      // Validate CSRF state before accepting the token
      const stateError = validateState(receivedState);
      if (stateError) {
        return {
          isCallback: true,
          jwt: null,
          error: stateError,
        };
      }
      return {
        isCallback: true,
        jwt: idToken,
        error: null,
      };
    }

    if (error) {
      clearOAuthCsrfState(); // Clean up state on error
      return {
        isCallback: true,
        jwt: null,
        error: errorDescription || error,
      };
    }
  }

  // Check URL search params (some providers use query params)
  const search = typeof window !== 'undefined' ? window.location.search : '';
  if (search) {
    const params = new URLSearchParams(search);
    const idToken = params.get('id_token');
    const receivedState = params.get('state');
    const error = params.get('error');

    if (idToken) {
      // Validate CSRF state before accepting the token
      const stateError = validateState(receivedState);
      if (stateError) {
        return {
          isCallback: true,
          jwt: null,
          error: stateError,
        };
      }
      return {
        isCallback: true,
        jwt: idToken,
        error: null,
      };
    }

    if (error) {
      clearOAuthCsrfState(); // Clean up state on error
      return {
        isCallback: true,
        jwt: null,
        error: params.get('error_description') || error,
      };
    }
  }

  return {
    isCallback: false,
    jwt: null,
    error: null,
  };
}

/**
 * Hook to get zkLogin user info
 * Uses Zustand store for reactive updates
 */
export function useZkLoginUser(): {
  address: string | null;
  email: string | null;
  name: string | null;
  picture: string | null;
  provider: ZkLoginProvider | null;
  isLoggedIn: boolean;
} {
  const { state, isConnected } = useZkLoginStore();

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
    isLoggedIn: isConnected,
  };
}
