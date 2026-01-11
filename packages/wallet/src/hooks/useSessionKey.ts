/**
 * useSessionKey Hook
 *
 * Provides React integration for session key management.
 * Session keys enable dApps to execute transactions on behalf of users
 * with limited, time-bound permissions.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Address, Hex } from 'viem';
import { useSmartAccount } from './useSmartAccount';
import { useChain } from './useChain';
import { SessionKeyManager } from '../core/aa/session-keys/manager';
import { SessionKeySigner } from '../core/signer/adapters/SessionKeySigner';
import type {
  SessionKeyConfig,
  SessionKeyState,
  SessionKeyPermission,
  SessionKeyValidation,
  SmartAccountTxRequest,
} from '../core/aa/types';

/**
 * useSessionKey hook result
 */
export interface UseSessionKeyResult {
  /** All active session keys */
  sessionKeys: SessionKeyState[];
  /** Create a new session key */
  createSessionKey: (
    config: SessionKeyConfig,
    password: string
  ) => Promise<SessionKeyState>;
  /** Get a session key by address */
  getSessionKey: (address: Address) => SessionKeyState | null;
  /** Validate a session key */
  validateSessionKey: (address: Address) => SessionKeyValidation;
  /** Revoke a session key */
  revokeSessionKey: (address: Address) => boolean;
  /** Revoke all session keys */
  revokeAllSessionKeys: () => void;
  /** Create a SessionKeySigner for a session */
  createSigner: (
    sessionAddress: Address,
    password: string
  ) => Promise<SessionKeySigner>;
  /** Send transaction using a session key */
  sendTransactionWithSession: (
    sessionAddress: Address,
    password: string,
    tx: SmartAccountTxRequest
  ) => Promise<Hex>;
  /** Cleanup expired sessions */
  cleanup: () => number;
  /** Whether session keys are available (smart account connected) */
  isAvailable: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
}

/**
 * Hook for managing session keys
 *
 * Provides functionality to create, manage, and use session keys
 * for dApp authorization.
 *
 * @param paymasterApiKey - Optional API key for gas sponsorship
 *
 * @example
 * ```tsx
 * function DAppAuthorization() {
 *   const {
 *     sessionKeys,
 *     createSessionKey,
 *     sendTransactionWithSession,
 *     isAvailable
 *   } = useSessionKey('pk_...');
 *
 *   const handleAuthorize = async () => {
 *     // Create session key with token transfer permission
 *     const session = await createSessionKey({
 *       permissions: [{
 *         target: USDC_ADDRESS,
 *         selectors: ['0xa9059cbb'], // transfer
 *         maxValue: 0n,
 *       }],
 *       validityPeriod: 3600, // 1 hour
 *       name: 'Uniswap Trading',
 *     }, 'user-password');
 *
 *     console.log('Session created:', session.address);
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleAuthorize} disabled={!isAvailable}>
 *         Authorize dApp
 *       </button>
 *       <p>Active sessions: {sessionKeys.length}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSessionKey(paymasterApiKey?: string): UseSessionKeyResult {
  const { state, signer: smartSigner } = useSmartAccount(paymasterApiKey);
  const { chain } = useChain();

  const [sessionKeys, setSessionKeys] = useState<SessionKeyState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create or get SessionKeyManager
  const manager = useMemo(() => {
    if (!state?.address || !chain.chainId) {
      return null;
    }
    return new SessionKeyManager(state.address, chain.chainId);
  }, [state?.address, chain.chainId]);

  // Load session keys when manager changes
  useEffect(() => {
    if (manager) {
      setSessionKeys(manager.getAllSessionKeys());
    } else {
      setSessionKeys([]);
    }
  }, [manager]);

  /**
   * Create a new session key
   */
  const createSessionKey = useCallback(
    async (
      config: SessionKeyConfig,
      password: string
    ): Promise<SessionKeyState> => {
      if (!manager) {
        throw new Error('Smart account not available');
      }

      setIsLoading(true);
      setError(null);

      try {
        const session = await manager.createSessionKey(config, password);
        setSessionKeys(manager.getAllSessionKeys());
        return session;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create session key';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [manager]
  );

  /**
   * Get a session key by address
   */
  const getSessionKey = useCallback(
    (address: Address): SessionKeyState | null => {
      return manager?.getSessionKey(address) ?? null;
    },
    [manager]
  );

  /**
   * Validate a session key
   */
  const validateSessionKey = useCallback(
    (address: Address): SessionKeyValidation => {
      if (!manager) {
        return { isValid: false, reason: 'Smart account not available' };
      }
      return manager.validateSessionKey(address);
    },
    [manager]
  );

  /**
   * Revoke a session key
   */
  const revokeSessionKey = useCallback(
    (address: Address): boolean => {
      if (!manager) {
        return false;
      }
      const result = manager.revokeSessionKey(address);
      if (result) {
        setSessionKeys(manager.getAllSessionKeys());
      }
      return result;
    },
    [manager]
  );

  /**
   * Revoke all session keys
   */
  const revokeAllSessionKeys = useCallback(() => {
    if (manager) {
      manager.revokeAllSessionKeys();
      setSessionKeys([]);
    }
  }, [manager]);

  /**
   * Create a SessionKeySigner for a session
   */
  const createSigner = useCallback(
    async (
      sessionAddress: Address,
      password: string
    ): Promise<SessionKeySigner> => {
      if (!manager || !smartSigner) {
        throw new Error('Smart account not available');
      }

      const session = manager.getSessionKey(sessionAddress);
      if (!session) {
        throw new Error('Session key not found');
      }

      const signer = new SessionKeySigner(
        session,
        smartSigner,
        manager,
        password
      );

      await signer.initialize();
      return signer;
    },
    [manager, smartSigner]
  );

  /**
   * Send transaction using a session key
   */
  const sendTransactionWithSession = useCallback(
    async (
      sessionAddress: Address,
      password: string,
      tx: SmartAccountTxRequest
    ): Promise<Hex> => {
      const signer = await createSigner(sessionAddress, password);
      const hash = await signer.sendTransaction(tx);

      // Refresh session keys to get updated tx count
      if (manager) {
        setSessionKeys(manager.getAllSessionKeys());
      }

      return hash;
    },
    [createSigner, manager]
  );

  /**
   * Cleanup expired sessions
   */
  const cleanup = useCallback((): number => {
    if (!manager) {
      return 0;
    }
    const removed = manager.cleanupSessions();
    if (removed > 0) {
      setSessionKeys(manager.getAllSessionKeys());
    }
    return removed;
  }, [manager]);

  return {
    sessionKeys,
    createSessionKey,
    getSessionKey,
    validateSessionKey,
    revokeSessionKey,
    revokeAllSessionKeys,
    createSigner,
    sendTransactionWithSession,
    cleanup,
    isAvailable: !!manager && !!smartSigner,
    isLoading,
    error,
  };
}

/**
 * Hook to get active session count
 *
 * @returns Number of active (non-expired, non-revoked) sessions
 */
export function useActiveSessionCount(): number {
  const { sessionKeys } = useSessionKey();
  return sessionKeys.filter((s) => !s.isRevoked).length;
}

/**
 * Hook to validate a specific session key
 *
 * @param sessionAddress - Session key address to validate
 * @returns Validation result
 */
export function useSessionKeyValidation(
  sessionAddress: Address | null
): SessionKeyValidation | null {
  const { validateSessionKey } = useSessionKey();

  if (!sessionAddress) {
    return null;
  }

  return validateSessionKey(sessionAddress);
}
