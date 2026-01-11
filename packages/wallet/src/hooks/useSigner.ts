/**
 * useSigner Hook
 *
 * Unified interface for accessing the current signer.
 * Automatically registers/unregisters signers based on wallet and zkLogin state.
 */

import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { SignerManager } from '../core/signer/SignerManager';
import { LocalSigner } from '../core/signer/adapters/LocalSigner';
import { ZkLoginSigner } from '../core/signer/adapters/ZkLoginSigner';
import { useWallet } from './useWallet';
import { useZkLogin } from './useZkLogin';
import type { SignerAdapter, SignerType } from '../core/signer/types';

/**
 * Result of useSigner hook
 */
export interface UseSignerResult {
  /** Currently active signer (null if no signer available) */
  signer: SignerAdapter | null;
  /** All available signers */
  available: SignerAdapter[];
  /** Switch to a different signer type */
  switchSigner: (type: SignerType) => void;
  /** Current wallet address (from active signer) */
  address: string | null;
  /** Whether any signer is connected */
  isConnected: boolean;
  /** Type of the current signer */
  signerType: SignerType | null;
  /** Check if a specific signer type is available */
  hasSigner: (type: SignerType) => boolean;
}

/**
 * Unified signer hook
 *
 * Manages signer registration based on wallet state and provides
 * a unified interface for accessing the current signer.
 *
 * @example
 * ```tsx
 * const { signer, address, isConnected } = useSigner();
 *
 * const handleSend = async () => {
 *   if (!signer) return;
 *   const txBytes = await tx.build({ client });
 *   const { signature } = await signer.sign(txBytes);
 * };
 * ```
 */
export function useSigner(): UseSignerResult {
  // Get wallet state
  const { status, account, getKeypair } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();

  // Subscribe to SignerManager changes
  const snapshot = useSyncExternalStore(
    (callback) => SignerManager.subscribeToStore(callback),
    () => SignerManager.getSnapshot(),
    () => SignerManager.getSnapshot()
  );

  // Register/unregister LocalSigner based on wallet state
  useEffect(() => {
    if (status === 'unlocked' && account) {
      const keypair = getKeypair();
      if (keypair) {
        SignerManager.register(new LocalSigner(keypair));
      }
    } else {
      // Only unregister if we had registered before
      if (SignerManager.has('local')) {
        SignerManager.unregister('local');
      }
    }
  }, [status, account, getKeypair]);

  // Register/unregister ZkLoginSigner based on zkLogin state
  useEffect(() => {
    if (isZkLoggedIn && zkState && zkState.proof) {
      try {
        SignerManager.register(new ZkLoginSigner(zkState));
      } catch (err) {
        console.warn('[useSigner] Failed to register ZkLoginSigner:', err);
      }
    } else {
      // Only unregister if we had registered before
      if (SignerManager.has('zklogin')) {
        SignerManager.unregister('zklogin');
      }
    }
  }, [isZkLoggedIn, zkState]);

  // Switch signer callback
  const switchSigner = useCallback((type: SignerType) => {
    SignerManager.switchTo(type);
  }, []);

  // Check if signer type is available
  const hasSigner = useCallback((type: SignerType) => {
    return SignerManager.has(type);
  }, []);

  return {
    signer: snapshot.current,
    available: snapshot.available,
    switchSigner,
    address: snapshot.current?.address ?? null,
    isConnected: snapshot.current !== null,
    signerType: snapshot.current?.type ?? null,
    hasSigner,
  };
}

/**
 * Selector hook to get just the connected address
 * More efficient if you only need the address
 */
export function useSignerAddress(): string | null {
  const snapshot = useSyncExternalStore(
    (callback) => SignerManager.subscribeToStore(callback),
    () => SignerManager.getSnapshot(),
    () => SignerManager.getSnapshot()
  );

  return snapshot.current?.address ?? null;
}

/**
 * Selector hook to check if any signer is connected
 */
export function useIsSignerConnected(): boolean {
  const snapshot = useSyncExternalStore(
    (callback) => SignerManager.subscribeToStore(callback),
    () => SignerManager.getSnapshot(),
    () => SignerManager.getSnapshot()
  );

  return snapshot.current !== null;
}
