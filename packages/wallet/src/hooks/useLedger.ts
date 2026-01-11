/**
 * useLedger Hook
 *
 * Manages Ledger hardware wallet connection and provides signing capabilities.
 * IMPORTANT: connect() must be called from a user gesture (button click).
 *
 * @example
 * ```tsx
 * function LedgerConnect() {
 *   const { connect, disconnect, isConnected, address, error } = useLedger();
 *
 *   return (
 *     <div>
 *       {isConnected ? (
 *         <div>
 *           <p>Connected: {address}</p>
 *           <button onClick={disconnect}>Disconnect</button>
 *         </div>
 *       ) : (
 *         <button onClick={connect}>Connect Ledger</button>
 *       )}
 *       {error && <p style={{ color: 'red' }}>{error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  type LedgerConnectionStatus,
  type LedgerDeviceInfo,
  type LedgerTransport,
  LedgerError,
} from '../core/ledger/types';
import {
  createTransport,
  closeTransport,
  isWebHIDSupported,
} from '../core/ledger/transport';
import { LedgerSigner } from '../core/signer/adapters/LedgerSigner';
import { SignerManager } from '../core/signer/SignerManager';
import { useChain } from './useChain';

/** Result of useLedger hook */
export interface UseLedgerResult {
  /** Current connection status */
  status: LedgerConnectionStatus;
  /** Connected device info (if any) */
  deviceInfo: LedgerDeviceInfo | null;
  /** Current Ledger address for active chain */
  address: string | null;
  /** Public key for active chain */
  publicKey: string | null;
  /** Derivation path used */
  derivationPath: string | null;
  /** Last error (if any) */
  error: LedgerError | null;
  /** Whether connected and ready */
  isConnected: boolean;
  /** Whether a connection attempt is in progress */
  isConnecting: boolean;
  /** Whether WebHID is supported in this browser */
  isSupported: boolean;
  /** Connect to Ledger device (MUST be called from user interaction) */
  connect: () => Promise<void>;
  /** Disconnect from device */
  disconnect: () => Promise<void>;
  /** Change account index */
  setAccountIndex: (index: number) => void;
  /** Current account index */
  accountIndex: number;
  /** Clear error state */
  clearError: () => void;
}

/**
 * Hook for managing Ledger hardware wallet connection
 *
 * Handles:
 * - Transport creation (WebHID)
 * - Signer initialization for current chain
 * - SignerManager registration
 * - Chain change re-initialization
 * - Connection lifecycle
 */
export function useLedger(): UseLedgerResult {
  const { chain, isEVM, isMove } = useChain();

  const [status, setStatus] = useState<LedgerConnectionStatus>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<LedgerDeviceInfo | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [derivationPath, setDerivationPath] = useState<string | null>(null);
  const [error, setError] = useState<LedgerError | null>(null);
  const [accountIndex, setAccountIndex] = useState(0);

  // Store transport and signer in refs to avoid re-renders
  const transportRef = useRef<LedgerTransport | null>(null);
  const signerRef = useRef<LedgerSigner | null>(null);

  // Track last chain type to detect changes
  const lastChainTypeRef = useRef<'move' | 'evm' | null>(null);

  const isSupported = isWebHIDSupported();

  /**
   * Connect to Ledger device
   * IMPORTANT: Must be called from button click handler
   */
  const connect = useCallback(async () => {
    if (!isSupported) {
      setError(
        new LedgerError(
          'WebHID is not supported in this browser. Please use Chrome or Edge.',
          'BROWSER_NOT_SUPPORTED'
        )
      );
      setStatus('error');
      return;
    }

    setStatus('connecting');
    setError(null);

    try {
      // Create WebHID transport (requires user gesture)
      const transport = await createTransport();
      transportRef.current = transport;

      // Determine chain type
      const chainType = isEVM ? 'evm' : 'move';
      lastChainTypeRef.current = chainType;

      // Create signer for current chain
      const signer = await LedgerSigner.create(transport, {
        chainType,
        accountIndex,
        evmChainId: chain.chainId,
      });

      signerRef.current = signer;

      // Register with SignerManager
      SignerManager.register(signer);

      // Update state
      setAddress(signer.address);
      setPublicKey(signer.publicKey);
      setDerivationPath(signer.derivationPath);
      setStatus('connected');

      // Set up disconnect handler
      try {
        transport.on('disconnect', handleDisconnect);
      } catch {
        // Transport may not support events
      }

      console.log('[useLedger] Connected:', signer.address);
    } catch (err) {
      console.error('[useLedger] Connection failed:', err);
      setStatus('error');
      if (err instanceof LedgerError) {
        setError(err);
      } else {
        setError(
          new LedgerError(
            err instanceof Error ? err.message : 'Failed to connect',
            'UNKNOWN',
            err
          )
        );
      }

      // Cleanup on error
      if (transportRef.current) {
        await closeTransport(transportRef.current);
        transportRef.current = null;
      }
    }
  }, [isSupported, isEVM, accountIndex, chain.chainId]);

  /**
   * Handle device disconnect
   */
  const handleDisconnect = useCallback(() => {
    console.warn('[useLedger] Device disconnected');
    setStatus('disconnected');
    setAddress(null);
    setPublicKey(null);
    setDerivationPath(null);
    signerRef.current = null;
    transportRef.current = null;

    if (SignerManager.has('ledger')) {
      SignerManager.unregister('ledger');
    }
  }, []);

  /**
   * Disconnect from device
   */
  const disconnect = useCallback(async () => {
    try {
      // Remove disconnect handler before closing
      if (transportRef.current) {
        try {
          transportRef.current.off('disconnect', handleDisconnect);
        } catch {
          // Transport may not support events
        }
        await closeTransport(transportRef.current);
      }
    } catch (err) {
      console.warn('[useLedger] Error during disconnect:', err);
    }

    // Unregister signer
    if (SignerManager.has('ledger')) {
      SignerManager.unregister('ledger');
    }

    // Reset state
    transportRef.current = null;
    signerRef.current = null;
    setStatus('disconnected');
    setAddress(null);
    setPublicKey(null);
    setDerivationPath(null);
    setDeviceInfo(null);
    setError(null);

    console.log('[useLedger] Disconnected');
  }, [handleDisconnect]);

  /**
   * Re-initialize signer when chain changes while connected
   */
  useEffect(() => {
    const currentChainType = isEVM ? 'evm' : 'move';

    // Skip if not connected or chain type hasn't changed
    if (
      status !== 'connected' ||
      !transportRef.current ||
      currentChainType === lastChainTypeRef.current
    ) {
      return;
    }

    const reinitialize = async () => {
      try {
        console.log('[useLedger] Chain changed, reinitializing signer...');

        // Create new signer for the new chain
        const signer = await LedgerSigner.create(transportRef.current!, {
          chainType: currentChainType,
          accountIndex,
          evmChainId: chain.chainId,
        });

        signerRef.current = signer;
        lastChainTypeRef.current = currentChainType;

        // Re-register with SignerManager
        SignerManager.register(signer);

        // Update state
        setAddress(signer.address);
        setPublicKey(signer.publicKey);
        setDerivationPath(signer.derivationPath);
        setError(null);

        console.log('[useLedger] Reinitialized for chain:', currentChainType, signer.address);
      } catch (err) {
        console.error('[useLedger] Failed to reinitialize:', err);
        setStatus('error');
        if (err instanceof LedgerError) {
          setError(err);
        } else {
          setError(
            new LedgerError(
              'Please open the correct app on your Ledger',
              'APP_NOT_OPEN',
              err
            )
          );
        }
      }
    };

    reinitialize();
  }, [isEVM, chain.chainId, status, accountIndex]);

  /**
   * Re-initialize when account index changes
   */
  useEffect(() => {
    if (status !== 'connected' || !transportRef.current || !signerRef.current) {
      return;
    }

    const switchAccount = async () => {
      try {
        console.log('[useLedger] Switching account to:', accountIndex);

        const chainType = isEVM ? 'evm' : 'move';

        const signer = await LedgerSigner.create(transportRef.current!, {
          chainType,
          accountIndex,
          evmChainId: chain.chainId,
        });

        signerRef.current = signer;
        SignerManager.register(signer);

        setAddress(signer.address);
        setPublicKey(signer.publicKey);
        setDerivationPath(signer.derivationPath);

        console.log('[useLedger] Switched to account:', accountIndex, signer.address);
      } catch (err) {
        console.error('[useLedger] Failed to switch account:', err);
        if (err instanceof LedgerError) {
          setError(err);
        }
      }
    };

    // Only switch if the derivation path would be different
    const expectedPath = isEVM
      ? `44'/60'/0'/0/${accountIndex}`
      : `m/44'/784'/0'/0'/${accountIndex}'`;

    if (derivationPath !== expectedPath) {
      switchAccount();
    }
  }, [accountIndex, isEVM, chain.chainId, status, derivationPath]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (transportRef.current) {
        closeTransport(transportRef.current).catch(() => {});
      }
      if (SignerManager.has('ledger')) {
        SignerManager.unregister('ledger');
      }
    };
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
    if (status === 'error') {
      setStatus('disconnected');
    }
  }, [status]);

  return {
    status,
    deviceInfo,
    address,
    publicKey,
    derivationPath,
    error,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    isSupported,
    connect,
    disconnect,
    setAccountIndex,
    accountIndex,
    clearError,
  };
}

/**
 * Hook to check if Ledger is currently the active signer
 */
export function useIsLedgerActive(): boolean {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const checkActive = () => {
      const current = SignerManager.getCurrent();
      setIsActive(current?.type === 'ledger');
    };

    checkActive();

    const unsubscribe = SignerManager.subscribe((event) => {
      if (event.type === 'switched' || event.type === 'registered' || event.type === 'unregistered') {
        checkActive();
      }
    });

    return unsubscribe;
  }, []);

  return isActive;
}
