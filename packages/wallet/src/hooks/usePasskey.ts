/**
 * usePasskey Hook
 *
 * React hook for passkey-based wallet authentication.
 * Enables biometric login (Face ID, Touch ID, Windows Hello).
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
} from '../core/passkey';

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
  /** Register a new passkey and create wallet */
  createWallet: (userName: string, credentialName?: string) => Promise<string>;
  /** Authenticate with passkey to unlock wallet */
  unlock: () => Promise<void>;
  /** Lock the wallet (clear keypair from memory) */
  lock: () => void;
  /** Delete wallet and all credentials */
  deleteWallet: () => void;
  /** Add a new credential to existing wallet */
  addCredential: (credentialName?: string) => Promise<void>;
  /** Remove a credential from wallet */
  removeCredential: (credentialId: string) => Promise<void>;
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

  // Local state
  const [wallet, setWallet] = useState<PasskeyWalletState | null>(() => getPasskeyWallet());
  const [keypair, setKeypair] = useState<Ed25519Keypair | null>(null);
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
      credentialName,
    }: {
      userName: string;
      credentialName?: string;
    }) => {
      setError(null);

      // Generate user ID from username
      const userId = btoa(userName)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      // Register passkey
      const registrationOptions: PasskeyRegistrationOptions = {
        userId,
        userName,
        credentialName,
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      };

      const { credential } = await registerPasskey(registrationOptions);

      // Authenticate immediately to get key material
      const authResult = await authenticateWithPasskey({
        allowCredentials: [credential.id],
        userVerification: 'required',
      });

      // Create wallet with the credential
      const result = await createPasskeyWallet(credential, authResult);

      return result;
    },
    onSuccess: ({ wallet: newWallet, keypair: newKeypair }) => {
      setWallet(newWallet);
      setKeypair(newKeypair);
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
    mutationFn: async () => {
      if (!wallet) {
        throw new PasskeyError('INVALID_STATE', 'No wallet to unlock');
      }

      setError(null);

      // Authenticate with any registered credential
      const authResult = await authenticateWithPasskey({
        allowCredentials: wallet.credentials.map((c) => c.id),
        userVerification: 'required',
      });

      // Unlock wallet
      const unlockedKeypair = await unlockPasskeyWallet(wallet, authResult);

      // Update last used timestamp
      const updatedWallet = updateCredentialLastUsed(wallet, authResult.credentialId);
      setWallet(updatedWallet);

      return unlockedKeypair;
    },
    onSuccess: (unlockedKeypair) => {
      setKeypair(unlockedKeypair);
      if (wallet) {
        onWalletUnlocked?.(wallet.address);
      }
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
      if (!wallet) {
        throw new PasskeyError('INVALID_STATE', 'No wallet exists');
      }

      setError(null);

      const userId = wallet.address; // Use address as user ID

      const { credential } = await registerPasskey({
        userId,
        userName: `Nasun Wallet (${wallet.address.slice(0, 8)}...)`,
        credentialName: credentialName || `Passkey ${wallet.credentials.length + 1}`,
        excludeCredentials: wallet.credentials.map((c) => c.id),
      });

      return addCredentialToWallet(wallet, credential);
    },
    onSuccess: (updatedWallet) => {
      setWallet(updatedWallet);
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
      if (!wallet) {
        throw new PasskeyError('INVALID_STATE', 'No wallet exists');
      }

      setError(null);
      return removeCredentialFromWallet(wallet, credentialId);
    },
    onSuccess: (updatedWallet) => {
      setWallet(updatedWallet);
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

  // Create wallet function
  const createWallet = useCallback(
    async (userName: string, credentialName?: string): Promise<string> => {
      const result = await createWalletMutation.mutateAsync({ userName, credentialName });
      return result.wallet.address;
    },
    [createWalletMutation]
  );

  // Unlock function
  const unlock = useCallback(async () => {
    await unlockMutation.mutateAsync();
  }, [unlockMutation]);

  // Lock function
  const lock = useCallback(() => {
    setKeypair(null);
  }, []);

  // Delete wallet function
  const deleteWallet = useCallback(() => {
    clearPasskeyWallet();
    setWallet(null);
    setKeypair(null);
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

  // Refresh function
  const refresh = useCallback(() => {
    setWallet(getPasskeyWallet());
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
    isUnlocked: !!keypair,
    isLoading:
      createWalletMutation.isPending ||
      unlockMutation.isPending ||
      addCredentialMutation.isPending ||
      removeCredentialMutation.isPending,
    error,
    keypair,
    address: wallet?.address ?? null,
    createWallet,
    unlock,
    lock,
    deleteWallet,
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
