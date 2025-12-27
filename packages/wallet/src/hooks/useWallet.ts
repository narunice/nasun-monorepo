/**
 * Nasun Wallet State Management Hook
 * Zustand based global state management
 */

import { create } from 'zustand';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { WalletState, WalletActions, WalletAccount } from '../types';
import {
  hasKeystore,
  createAndSaveWallet,
  createWalletWithMnemonic,
  importWalletFromMnemonic,
  importWalletFromPrivateKey,
  unlockKeystore,
  deleteKeystore,
  getStoredAddress,
} from '../core/keystore';
import { getPublicKeyFromKeypair, getAddressFromKeypair, getSecretKeyFromKeypair } from '../core/crypto';
import { saveSessionPassword, getSessionPassword, clearSessionPassword } from '../sui/client';

// Internal state (keypair is not stored in the store)
let currentKeypair: Ed25519Keypair | null = null;

interface WalletStore extends WalletState, WalletActions {
  // Internal methods
  _initialize: () => void;
  // Keypair accessor (needed for signing)
  getKeypair: () => Ed25519Keypair | null;
}

export const useWallet = create<WalletStore>((set) => ({
  // Initial state
  status: 'disconnected',
  account: null,
  isLoading: false,
  error: null,

  // Initialize (called at app start)
  _initialize: async () => {
    if (hasKeystore()) {
      const address = getStoredAddress();
      if (address) {
        // Try auto-unlock from session
        const sessionPassword = getSessionPassword();
        if (sessionPassword) {
          try {
            const keypair = await unlockKeystore(sessionPassword);
            currentKeypair = keypair;
            const account: WalletAccount = {
              address: getAddressFromKeypair(keypair),
              publicKey: getPublicKeyFromKeypair(keypair),
            };
            set({ status: 'unlocked', account });
            return;
          } catch {
            // Session password invalid, clear it
            clearSessionPassword();
          }
        }
        set({ status: 'locked', account: null });
      }
    } else {
      set({ status: 'disconnected', account: null });
    }
  },

  // Create new wallet
  createWallet: async (password: string): Promise<string> => {
    set({ isLoading: true, error: null });
    try {
      const address = await createAndSaveWallet(password);

      // Auto-unlock after creation
      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      // Save to session for auto-unlock on page refresh
      saveSessionPassword(password);

      const account: WalletAccount = {
        address,
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({
        status: 'unlocked',
        account,
        isLoading: false,
      });

      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // Unlock wallet
  unlockWallet: async (password: string): Promise<void> => {
    set({ isLoading: true, error: null });
    try {
      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      // Save to session for auto-unlock on page refresh
      saveSessionPassword(password);

      const account: WalletAccount = {
        address: getAddressFromKeypair(keypair),
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({
        status: 'unlocked',
        account,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to unlock wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // Lock wallet
  lockWallet: () => {
    currentKeypair = null;
    clearSessionPassword();
    const address = getStoredAddress();
    set({
      status: address ? 'locked' : 'disconnected',
      account: null,
      error: null,
    });
  },

  // Delete wallet
  deleteWallet: () => {
    currentKeypair = null;
    clearSessionPassword();
    deleteKeystore();
    set({
      status: 'disconnected',
      account: null,
      error: null,
    });
  },

  // Import from mnemonic (legacy compatible)
  importWallet: async (mnemonic: string, password: string): Promise<string> => {
    set({ isLoading: true, error: null });
    try {
      const address = await importWalletFromMnemonic(mnemonic, password);

      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      // Save to session for auto-unlock on page refresh
      saveSessionPassword(password);

      const account: WalletAccount = {
        address,
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({ status: 'unlocked', account, isLoading: false });

      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // Create wallet with mnemonic backup
  createWalletWithBackup: async (password: string): Promise<{ address: string; mnemonic: string }> => {
    set({ isLoading: true, error: null });
    try {
      const { address, mnemonic } = await createWalletWithMnemonic(password);

      // Auto-unlock
      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      // Save to session for auto-unlock on page refresh
      saveSessionPassword(password);

      const account: WalletAccount = {
        address,
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({ status: 'unlocked', account, isLoading: false });

      return { address, mnemonic };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // Import from mnemonic (explicit method)
  importFromMnemonic: async (mnemonic: string, password: string): Promise<string> => {
    set({ isLoading: true, error: null });
    try {
      const address = await importWalletFromMnemonic(mnemonic, password);

      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      // Save to session for auto-unlock on page refresh
      saveSessionPassword(password);

      const account: WalletAccount = {
        address,
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({ status: 'unlocked', account, isLoading: false });

      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // Import from private key
  importFromPrivateKey: async (privateKey: string, password: string): Promise<string> => {
    set({ isLoading: true, error: null });
    try {
      const address = await importWalletFromPrivateKey(privateKey, password);

      const keypair = await unlockKeystore(password);
      currentKeypair = keypair;

      // Save to session for auto-unlock on page refresh
      saveSessionPassword(password);

      const account: WalletAccount = {
        address,
        publicKey: getPublicKeyFromKeypair(keypair),
      };

      set({ status: 'unlocked', account, isLoading: false });

      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // Export private key (requires password verification)
  exportPrivateKey: async (password: string): Promise<string> => {
    try {
      // Verify password by attempting to decrypt
      const keypair = await unlockKeystore(password);
      return getSecretKeyFromKeypair(keypair);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export private key';
      throw new Error(message);
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Keypair accessor
  getKeypair: () => {
    return currentKeypair;
  },
}));

// Convenience function: wallet status only
export function useWalletStatus() {
  return useWallet((state) => state.status);
}

// Convenience function: account info only
export function useWalletAccount() {
  return useWallet((state) => state.account);
}

// Convenience function: loading/error state only
export function useWalletLoading() {
  return useWallet((state) => ({
    isLoading: state.isLoading,
    error: state.error,
  }));
}
