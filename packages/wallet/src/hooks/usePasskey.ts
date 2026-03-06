/**
 * usePasskey Hook
 *
 * React hook for passkey-based wallet authentication.
 * Enables biometric login (Face ID, Touch ID, Windows Hello).
 *
 * Security: Uses WebAuthn PRF extension when available for true
 * cryptographic protection. Falls back to credential-ID based
 * key derivation when PRF is not supported.
 *
 * State Management: Uses passkeyStore (Zustand) for wallet/keypair
 * so all hook instances share the same global state. Error state
 * remains component-local via useState.
 */

import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type {
  PasskeyCredential,
  PasskeyWalletState,
  PasskeyRegistrationOptions,
} from '../types/passkey';
import {
  PasskeyError,
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
} from '../types/passkey';
import {
  registerPasskey,
  authenticateWithPasskey,
  createPasskeyWallet,
  unlockPasskeyWallet,
  getPasskeyWallet,
  clearPasskeyWallet,
  addCredentialToWallet,
  removeCredentialFromWallet,
  updateCredentialLastUsed,
  base64urlEncode,
  deriveEVMPasswordFromPasskey,
} from '../core/passkey';
import { createEVMWalletFromMnemonic, hasEVMWallet, deleteEVMWallet } from '../core/evm';
import { saveSessionPassword, clearSessionPassword } from '../sui/client';
import { getSecretKeyFromKeypair } from '../core/crypto';
import { usePasskeyStore } from '../stores/passkeyStore';

/**
 * Passkey hook options
 */
export interface UsePasskeyOptions {
  /** Auto-check for existing wallet on mount */
  autoCheck?: boolean;
  /** Callback when wallet is created */
  onWalletCreated?: (address: string) => void;
  /** Callback when wallet is unlocked */
  onWalletUnlocked?: (address: string) => void;
  /** Callback on error */
  onError?: (error: PasskeyError) => void;
}

/**
 * Passkey hook return type
 */
export interface UsePasskeyResult {
  /** Whether WebAuthn is supported */
  isSupported: boolean;
  /** Whether platform authenticator is available */
  isPlatformAvailable: boolean | null;
  /** Current wallet state (null if no wallet) */
  wallet: PasskeyWalletState | null;
  /** Whether wallet is unlocked (keypair available) */
  isUnlocked: boolean;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Current error (if any) */
  error: PasskeyError | null;
  /** Current keypair (null if locked) */
  keypair: Ed25519Keypair | null;
  /** Wallet address */
  address: string | null;
  /** Whether this wallet requires a password to unlock (non-PRF) */
  needsPassword: boolean;
  /** Register a new passkey and create wallet */
  createWallet: (userName: string, password?: string, credentialName?: string) => Promise<{ address: string; mnemonic: string }>;
  /** Authenticate with passkey to unlock wallet */
  unlock: (password?: string) => Promise<void>;
  /** Lock the wallet (clear keypair from memory) */
  lock: () => void;
  /** Delete wallet and all credentials (requires biometric re-auth) */
  deleteWallet: () => Promise<void>;
  /** Add a new credential to existing wallet */
  addCredential: (credentialName?: string) => Promise<void>;
  /** Remove a credential from wallet */
  removeCredential: (credentialId: string) => Promise<void>;
  /** Export private key (requires biometric re-authentication) */
  exportPrivateKey: () => Promise<string>;
  /** List all credentials */
  credentials: PasskeyCredential[];
  /** Refresh wallet state from storage */
  refresh: () => void;
}

/**
 * React hook for passkey-based wallet
 */
export function usePasskey(options: UsePasskeyOptions = {}): UsePasskeyResult {
  const { autoCheck = true, onWalletCreated, onWalletUnlocked, onError } = options;
  const queryClient = useQueryClient();

  // Global state from Zustand store (shared across all hook instances)
  const wallet = usePasskeyStore((s) => s.wallet);
  const keypair = usePasskeyStore((s) => s.keypair);
  const isUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const address = usePasskeyStore((s) => s.address);

  // Component-local error state
  const [error, setError] = useState<PasskeyError | null>(null);

  // Check WebAuthn support
  const isSupported = isWebAuthnSupported();

  // Check platform authenticator availability
  const { data: isPlatformAvailable } = useQuery({
    queryKey: ['passkey', 'platform-available'],
    queryFn: isPlatformAuthenticatorAvailable,
    enabled: autoCheck && isSupported,
    staleTime: Infinity,
  });

  // Create wallet mutation
  const createWalletMutation = useMutation({
    mutationFn: async ({
      userName,
      password,
      credentialName,
    }: {
      userName: string;
      password?: string;
      credentialName?: string;
    }) => {
      setError(null);

      // Generate user ID from username (safe for all Unicode characters)
      const userId = base64urlEncode(new TextEncoder().encode(userName));

      // Register passkey (biometric prompt)
      const registrationOptions: PasskeyRegistrationOptions = {
        userId,
        userName,
        credentialName,
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      };

      // PRF output is returned directly from create() when eval.first is provided,
      // so no second credentials.get() call is needed (Safari iOS forbids two WebAuthn
      // calls per user gesture; the second would throw NotAllowedError).
      const { credential, prfOutput } = await registerPasskey(registrationOptions);

      // Determine key derivation method (same logic as createPasskeyWallet)
      const keyDerivationMethod = prfOutput ? 'prf' : (password ? 'credential-id-password' : 'credential-id');

      // Derive EVM password BEFORE createPasskeyWallet zeros prfOutput in finally block
      const evmPassword = deriveEVMPasswordFromPasskey(
        keyDerivationMethod, prfOutput, password, credential.id,
      );

      // Create passkey wallet (this zeros prfOutput in its finally block)
      const result = await createPasskeyWallet(credential, prfOutput, password);

      // Create EVM wallet if it doesn't already exist (e.g., from a mnemonic wallet)
      if (evmPassword && !hasEVMWallet()) {
        try {
          await createEVMWalletFromMnemonic(result.mnemonic, evmPassword);
        } catch {
          // EVM wallet creation failure is non-fatal
        }
      }

      return { ...result, evmPassword };
    },
    onSuccess: ({ wallet: newWallet, keypair: newKeypair, mnemonic, evmPassword }) => {
      // Store mnemonic BEFORE unlocking — setUnlocked triggers re-renders that may
      // unmount the current WalletConnect (e.g., WelcomeBanner on homepage).
      // The new WalletConnect instance reads pendingMnemonic on mount.
      if (mnemonic) {
        usePasskeyStore.getState().setPendingMnemonic(mnemonic);
      }
      // Update global store — all usePasskey instances see this immediately
      usePasskeyStore.getState().setUnlocked(newWallet, newKeypair);
      if (evmPassword) saveSessionPassword(evmPassword);
      onWalletCreated?.(newWallet.address);
      queryClient.invalidateQueries({ queryKey: ['passkey'] });
    },
    onError: (err) => {
      const passkeyError =
        err instanceof PasskeyError
          ? err
          : new PasskeyError('REGISTRATION_FAILED', 'Failed to create wallet');
      setError(passkeyError);
      onError?.(passkeyError);
      throw passkeyError;
    },
  });

  // Unlock wallet mutation
  const unlockMutation = useMutation({
    mutationFn: async (password?: string) => {
      // Read current wallet from store to avoid stale closure
      const currentWallet = usePasskeyStore.getState().wallet;
      if (!currentWallet) {
        throw new PasskeyError('INVALID_STATE', 'No wallet to unlock');
      }

      setError(null);

      // Authenticate with passkey (biometric gate — proves device ownership)
      const authResult = await authenticateWithPasskey({
        allowCredentials: currentWallet.credentials.map((c) => c.id),
        userVerification: 'required',
      });

      // Verify the authenticated credential belongs to this wallet
      if (!currentWallet.credentials.some((c) => c.id === authResult.credentialId)) {
        throw new PasskeyError('CREDENTIAL_NOT_FOUND', 'Authenticated with unrecognized credential');
      }

      // Derive EVM password BEFORE unlockPasskeyWallet zeros prfOutput in finally block
      const evmPassword = deriveEVMPasswordFromPasskey(
        currentWallet.keyDerivationMethod,
        authResult.prfOutput,
        password,
        authResult.credentialId,
      );

      // Decrypt wallet (PRF output for PRF wallets, password for credential-id-password wallets)
      const unlockedKeypair = await unlockPasskeyWallet(currentWallet, authResult.prfOutput, password);

      // Update last used timestamp
      const updatedWallet = updateCredentialLastUsed(currentWallet, authResult.credentialId);

      return { unlockedKeypair, updatedWallet, evmPassword };
    },
    onSuccess: ({ unlockedKeypair, updatedWallet, evmPassword }) => {
      // Update global store with keypair + updated wallet metadata
      usePasskeyStore.getState().setUnlocked(updatedWallet, unlockedKeypair);
      if (evmPassword) saveSessionPassword(evmPassword);
      onWalletUnlocked?.(updatedWallet.address);
    },
    onError: (err) => {
      const passkeyError =
        err instanceof PasskeyError
          ? err
          : new PasskeyError('AUTHENTICATION_FAILED', 'Failed to unlock wallet');
      setError(passkeyError);
      onError?.(passkeyError);
      throw passkeyError;
    },
  });

  // Add credential mutation
  const addCredentialMutation = useMutation({
    mutationFn: async (credentialName?: string) => {
      const currentWallet = usePasskeyStore.getState().wallet;
      if (!currentWallet) {
        throw new PasskeyError('INVALID_STATE', 'No wallet exists');
      }

      setError(null);

      const userId = currentWallet.address; // Use address as user ID

      const { credential } = await registerPasskey({
        userId,
        userName: `Nasun Wallet (${currentWallet.address.slice(0, 8)}...)`,
        credentialName: credentialName || `Passkey ${currentWallet.credentials.length + 1}`,
        excludeCredentials: currentWallet.credentials.map((c) => c.id),
      });

      return addCredentialToWallet(currentWallet, credential);
    },
    onSuccess: (updatedWallet) => {
      usePasskeyStore.getState().setWallet(updatedWallet);
      queryClient.invalidateQueries({ queryKey: ['passkey'] });
    },
    onError: (err) => {
      const passkeyError =
        err instanceof PasskeyError
          ? err
          : new PasskeyError('REGISTRATION_FAILED', 'Failed to add credential');
      setError(passkeyError);
      onError?.(passkeyError);
      throw passkeyError;
    },
  });

  // Remove credential mutation
  const removeCredentialMutation = useMutation({
    mutationFn: async (credentialId: string) => {
      const currentWallet = usePasskeyStore.getState().wallet;
      if (!currentWallet) {
        throw new PasskeyError('INVALID_STATE', 'No wallet exists');
      }

      setError(null);
      return removeCredentialFromWallet(currentWallet, credentialId);
    },
    onSuccess: (updatedWallet) => {
      usePasskeyStore.getState().setWallet(updatedWallet);
      queryClient.invalidateQueries({ queryKey: ['passkey'] });
    },
    onError: (err) => {
      const passkeyError =
        err instanceof PasskeyError
          ? err
          : new PasskeyError('INVALID_STATE', 'Failed to remove credential');
      setError(passkeyError);
      onError?.(passkeyError);
      throw passkeyError;
    },
  });

  // Create wallet function — returns { address, mnemonic } for backup
  const createWallet = useCallback(
    async (userName: string, password?: string, credentialName?: string): Promise<{ address: string; mnemonic: string }> => {
      const result = await createWalletMutation.mutateAsync({ userName, password, credentialName });
      return { address: result.wallet.address, mnemonic: result.mnemonic };
    },
    [createWalletMutation]
  );

  // Unlock function
  const unlock = useCallback(async (password?: string) => {
    await unlockMutation.mutateAsync(password);
  }, [unlockMutation]);

  // Lock function — drop keypair reference so GC can collect it.
  // Note: JS strings are immutable; we cannot reliably zero the keypair's
  // internal secret key in memory. Clearing the store reference is
  // the strongest measure available in a browser environment.
  const lock = useCallback(() => {
    usePasskeyStore.getState().lock();
    clearSessionPassword();
  }, []);

  // Delete wallet function — requires biometric re-authentication
  const deleteWallet = useCallback(async () => {
    const currentWallet = usePasskeyStore.getState().wallet;
    if (currentWallet) {
      // Require biometric re-authentication before destructive action
      await authenticateWithPasskey({
        allowCredentials: currentWallet.credentials.map((c) => c.id),
        userVerification: 'required',
      });
    }

    clearPasskeyWallet();
    deleteEVMWallet();
    clearSessionPassword();
    usePasskeyStore.getState().clear();
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['passkey'] });
  }, [queryClient]);

  // Add credential function
  const addCredential = useCallback(
    async (credentialName?: string) => {
      await addCredentialMutation.mutateAsync(credentialName);
    },
    [addCredentialMutation]
  );

  // Remove credential function
  const removeCredential = useCallback(
    async (credentialId: string) => {
      await removeCredentialMutation.mutateAsync(credentialId);
    },
    [removeCredentialMutation]
  );

  // Refresh function — reload wallet metadata from localStorage
  const refresh = useCallback(() => {
    usePasskeyStore.getState().setWallet(getPasskeyWallet());
  }, []);

  // Export private key — requires biometric re-authentication as security gate
  const exportPrivateKey = useCallback(async (): Promise<string> => {
    const currentWallet = usePasskeyStore.getState().wallet;
    const currentKeypair = usePasskeyStore.getState().keypair;
    if (!currentWallet || !currentKeypair) {
      throw new PasskeyError('INVALID_STATE', 'Wallet must be unlocked to export');
    }

    // Biometric re-authentication before exposing sensitive material
    await authenticateWithPasskey({
      allowCredentials: currentWallet.credentials.map((c) => c.id),
      userVerification: 'required',
    });

    return getSecretKeyFromKeypair(currentKeypair);
  }, []);

  // Check for existing wallet on mount
  useEffect(() => {
    if (autoCheck) {
      refresh();
    }
  }, [autoCheck, refresh]);

  return {
    isSupported,
    isPlatformAvailable: isPlatformAvailable ?? null,
    wallet,
    isUnlocked,
    isLoading:
      createWalletMutation.isPending ||
      unlockMutation.isPending ||
      addCredentialMutation.isPending ||
      removeCredentialMutation.isPending,
    error,
    keypair,
    address,
    needsPassword: wallet?.keyDerivationMethod === 'credential-id-password',
    createWallet,
    unlock,
    lock,
    deleteWallet,
    exportPrivateKey,
    addCredential,
    removeCredential,
    credentials: wallet?.credentials ?? [],
    refresh,
  };
}

/**
 * Check if passkey wallet exists
 */
export function hasPasskeyWallet(): boolean {
  return getPasskeyWallet() !== null;
}
