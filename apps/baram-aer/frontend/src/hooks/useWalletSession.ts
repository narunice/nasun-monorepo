/**
 * useWalletSession - Manages wallet connection state, idle timeout, and chat storage lifecycle
 *
 * Consolidates three wallet types (password, zkLogin, Ledger) into a unified
 * isConnected flag and handles storage load/clear on connect/disconnect.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useWallet, useZkLogin, useLedger, useSigner, getSessionPassword } from '@nasun/wallet';
import { useIdleTimeout } from './useIdleTimeout';
import { useChatStore } from '@/stores/chatStore';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Lightweight read-only hook for wallet connection state (no side effects).
 * Use this in components that only need to check if wallet is connected.
 */
export function useIsConnected(): boolean {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const { isConnected: isLedgerConnected } = useLedger();
  return (status === 'unlocked' && !!account) || isZkLoggedIn || isLedgerConnected;
}

export interface UseWalletSessionReturn {
  isConnected: boolean;
  walletAddress: string | null;
}

export function useWalletSession(): UseWalletSessionReturn {
  const isConnected = useIsConnected();
  const { status, lockWallet } = useWallet();
  const { isConnected: isZkLoggedIn, logout: zkLogout } = useZkLogin();
  const { address: signerAddress } = useSigner();

  const walletAddress = signerAddress || null;

  const loadFromStorage = useChatStore((state) => state.loadFromStorage);
  const clearOnLogout = useChatStore((state) => state.clearOnLogout);

  // Track previous wallet address for disconnect detection
  const prevAddressRef = useRef<string | null>(null);

  // Idle timeout: lock password wallet or disconnect zkLogin after inactivity
  const handleIdleTimeout = useCallback(() => {
    if (status === 'unlocked') {
      lockWallet();
    } else if (isZkLoggedIn) {
      zkLogout();
    }
  }, [status, isZkLoggedIn, lockWallet, zkLogout]);

  useIdleTimeout(handleIdleTimeout, IDLE_TIMEOUT_MS);

  // Handle wallet connect/disconnect
  useEffect(() => {
    const currentAddress = walletAddress;
    const prevAddress = prevAddressRef.current;

    if (currentAddress && currentAddress !== prevAddress) {
      // Wallet connected or changed - derive key and load data
      const password = getSessionPassword();
      loadFromStorage(currentAddress, password ?? undefined);
    } else if (!currentAddress && prevAddress) {
      // Wallet disconnected - clear memory (keep encrypted data in IndexedDB)
      clearOnLogout();
    }

    prevAddressRef.current = currentAddress;
  }, [walletAddress, loadFromStorage, clearOnLogout]);

  return { isConnected, walletAddress };
}
