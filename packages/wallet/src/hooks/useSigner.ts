/**
 * useSigner Hook
 *
 * Unified interface for accessing the current signer.
 * Automatically registers/unregisters signers based on wallet and zkLogin state.
 * Supports multi-chain with automatic EVM signer registration.
 */

import { useEffect, useCallback, useSyncExternalStore, useState } from 'react';
import { SignerManager } from '../core/signer/SignerManager';
import { LocalSigner } from '../core/signer/adapters/LocalSigner';
import { ZkLoginSigner } from '../core/signer/adapters/ZkLoginSigner';
import { EVMSigner } from '../core/signer/adapters/EVMSigner';
import { NsaSigner } from '../core/signer/adapters/NsaSigner';
import { PasskeySigner } from '../core/signer/adapters/PasskeySigner';
import { useWallet } from './useWallet';
import { useZkLogin } from './useZkLogin';
import { useChain } from './useChain';
import { useNsaStore } from '../stores/nsaStore';
import { usePasskeyStore } from '../stores/passkeyStore';
import { hasEVMWallet, unlockEVMWallet } from '../core/evm/keystore';
import { getSessionPassword } from '../sui/client';
import { deriveChainAddress } from '../core/crypto';
import { getAddressScheme, isNasunChain } from '../config/chains';
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
  const { chain, isEVM, isMove } = useChain();

  // Passkey store state
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  // Track EVM wallet unlock state
  const [evmUnlocked, setEvmUnlocked] = useState(false);

  // NSA store state
  const nsaAccountObjectId = useNsaStore((s) => s.accountObjectId);
  const nsaIsInitialized = useNsaStore((s) => s.isInitialized);

  // Subscribe to SignerManager changes
  const snapshot = useSyncExternalStore(
    (callback) => SignerManager.subscribeToStore(callback),
    () => SignerManager.getSnapshot(),
    () => SignerManager.getSnapshot()
  );

  // Register/unregister LocalSigner based on wallet state and current chain
  useEffect(() => {
    if (status === 'unlocked' && account) {
      const keypair = getKeypair();
      if (keypair) {
        try {
          const scheme = getAddressScheme(chain.id);
          const chainAddress = deriveChainAddress(keypair, scheme);
          if (process.env.NODE_ENV === 'development') {
            console.log(`[useSigner] chain=${chain.id} scheme=${scheme} address=${chainAddress.slice(0, 10)}...`);
          }
          SignerManager.register(new LocalSigner(keypair, chainAddress));
        } catch (err) {
          console.error('[useSigner] Failed to derive chain address:', err);
          // Only fall back to default Sui address for Sui-compatible chains.
          // For external chains (IOTA etc.), wrong address = potential fund loss.
          if (isNasunChain(chain.id)) {
            SignerManager.register(new LocalSigner(keypair));
          } else if (SignerManager.has('local')) {
            SignerManager.unregister('local');
          }
        }
      }
    } else {
      // Only unregister if we had registered before
      if (SignerManager.has('local')) {
        SignerManager.unregister('local');
      }
    }
  }, [status, account, getKeypair, chain.id]);

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

  // Register/unregister PasskeySigner based on passkey store state
  useEffect(() => {
    if (isPasskeyUnlocked && passkeyKeypair && passkeyAddress) {
      SignerManager.register(new PasskeySigner(passkeyKeypair, passkeyAddress));
    } else {
      if (SignerManager.has('passkey')) {
        SignerManager.unregister('passkey');
      }
    }
  }, [isPasskeyUnlocked, passkeyKeypair, passkeyAddress]);

  // Register/unregister EVMSigner based on EVM chain and wallet state
  useEffect(() => {
    const registerEVMSigner = async () => {
      // Only register EVM signer when EVM chain is selected and wallet exists
      if (!isEVM || !hasEVMWallet()) {
        if (SignerManager.has('evm')) {
          SignerManager.unregister('evm');
          setEvmUnlocked(false);
        }
        return;
      }

      // Try to unlock EVM wallet with session password
      const sessionPassword = getSessionPassword();
      if (!sessionPassword) {
        // No session password available, EVM wallet stays locked
        if (SignerManager.has('evm')) {
          SignerManager.unregister('evm');
          setEvmUnlocked(false);
        }
        return;
      }

      try {
        const account = await unlockEVMWallet(sessionPassword);
        const chainId = chain.chainId;
        if (chainId) {
          SignerManager.register(new EVMSigner(account, chainId));
          setEvmUnlocked(true);
        }
      } catch (err) {
        console.warn('[useSigner] Failed to unlock EVM wallet:', err);
        if (SignerManager.has('evm')) {
          SignerManager.unregister('evm');
          setEvmUnlocked(false);
        }
      }
    };

    registerEVMSigner();
  }, [isEVM, chain.chainId, status]); // Re-run when chain changes or wallet status changes

  // Register/unregister NsaSigner when SmartAccount is configured
  useEffect(() => {
    if (!nsaIsInitialized || !nsaAccountObjectId) {
      if (SignerManager.has('nsa')) {
        SignerManager.unregister('nsa');
      }
      return;
    }

    // Wrap the underlying Move signer (prefer local, fallback to passkey, then zklogin)
    const underlyingSigner = SignerManager.get('local') || SignerManager.get('passkey') || SignerManager.get('zklogin');
    if (underlyingSigner) {
      SignerManager.register(new NsaSigner(underlyingSigner, nsaAccountObjectId));
    } else {
      if (SignerManager.has('nsa')) {
        SignerManager.unregister('nsa');
      }
    }
  }, [nsaIsInitialized, nsaAccountObjectId, snapshot.available.length]);

  // Auto-switch to appropriate signer when chain changes
  // Priority on Move: nsa > local > passkey > zklogin
  useEffect(() => {
    if (isEVM && SignerManager.has('evm')) {
      SignerManager.switchTo('evm');
    } else if (isMove && SignerManager.has('nsa')) {
      SignerManager.switchTo('nsa');
    } else if (isMove && SignerManager.has('local')) {
      SignerManager.switchTo('local');
    } else if (isMove && SignerManager.has('passkey')) {
      SignerManager.switchTo('passkey');
    } else if (isMove && SignerManager.has('zklogin')) {
      SignerManager.switchTo('zklogin');
    }
  }, [isEVM, isMove, evmUnlocked, snapshot.available.length]);

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
