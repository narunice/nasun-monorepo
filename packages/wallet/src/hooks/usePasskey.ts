/**
 * usePasskey Hook
 *
 * React hook for passkey-based wallet authentication.
 * Enables biometric login (Face ID, Touch ID, Windows Hello).
 *
 * Security: Uses WebAuthn PRF extension when available for true
 * cryptographic protection. Falls back to credential-ID based
 * key derivation when PRF is not supported.
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
  createWallet: (userName: string, credentialName?: string) => Promise<{ address: string; mnemonic: string }>;
  /** Authenticate with passkey to unlock wallet */
  unlock: () => Promise<void>;
  /** Lock the wallet (clear keypair from memory) */
  lock: () => void;
  /** Delete wallet and all credentials (requires biometric re-auth) */
  deleteWallet: () => Promise<void>;
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

      const { credential, prfSupported } = await registerPasskey(registrationOptions);

      // If PRF is supported, authenticate to get PRF output for encryption
      let prfOutput: ArrayBuffer | undefined;
      if (prfSupported) {
        const authResult = await authenticateWithPasskey({
          allowCredentials: [credential.id],
          userVerification: 'required',
        });
        prfOutput = authResult.prfOutput;
      }

      // Create wallet with credential (and PRF output if available)
      const result = await createPasskeyWallet(credential, prfOutput);

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

      // Authenticate with passkey (biometric gate — proves device ownership)
      const authResult = await authenticateWithPasskey({
        allowCredentials: wallet.credentials.map((c) => c.id),
        userVerification: 'required',
      });

      // Verify the authenticated credential belongs to this wallet
      if (!wallet.credentials.some((c) => c.id === authResult.credentialId)) {
        throw new PasskeyError('CREDENTIAL_NOT_FOUND', 'Authenticated with unrecognized credential');
      }

      // Decrypt wallet (PRF output used if wallet was created with PRF)
      const unlockedKeypair = await unlockPasskeyWallet(wallet, authResult.prfOutput);

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

  // Create wallet function — returns { address, mnemonic } for backup
  const createWallet = useCallback(
    async (userName: string, credentialName?: string): Promise<{ address: string; mnemonic: string }> => {
      const result = await createWalletMutation.mutateAsync({ userName, credentialName });
      return { address: result.wallet.address, mnemonic: result.mnemonic };
    },
    [createWalletMutation]
  );

  // Unlock function
  const unlock = useCallback(async () => {
    await unlockMutation.mutateAsync();
  }, [unlockMutation]);

  // Lock function — drop keypair reference so GC can collect it.
  // Note: JS strings are immutable; we cannot reliably zero the keypair's
  // internal secret key in memory. Clearing the React state reference is
  // the strongest measure available in a browser environment.
  const lock = useCallback(() => {
    setKeypair(null);
  }, []);

  // Delete wallet function — requires biometric re-authentication
  const deleteWallet = useCallback(async () => {
    if (wallet) {
      // Require biometric re-authentication before destructive action
      await authenticateWithPasskey({
        allowCredentials: wallet.credentials.map((c) => c.id),
        userVerification: 'required',
      });
    }

    clearPasskeyWallet();
    setWallet(null);
    setKeypair(null);
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['passkey'] });
  }, [wallet, queryClient]);

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
