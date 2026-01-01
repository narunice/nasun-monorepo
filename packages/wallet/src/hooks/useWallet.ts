/**
 * Nasun Wallet State Management Hook
 * Zustand based global state management
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { WalletState, WalletActions, WalletAccount, SecuritySettings } from '../types';
import { DEFAULT_SECURITY_SETTINGS } from '../types';
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

// Auto-lock interval ID
let autoLockIntervalId: ReturnType<typeof setInterval> | null = null;

interface WalletStore extends WalletState, WalletActions {
  // Internal methods
  _initialize: () => void;
  // Keypair accessor (needed for signing)
  getKeypair: () => Ed25519Keypair | null;
  // Security settings
  security: SecuritySettings;
  updateSecuritySettings: (settings: Partial<SecuritySettings>) => void;
  updateLastActivity: () => void;
}

export const useWallet = create<WalletStore>((set, get) => ({
  // Initial state
  status: 'disconnected',
  account: null,
  isLoading: false,
  error: null,

  // Security settings (persisted separately in localStorage)
  security: loadSecuritySettings(),

  // Update security settings
  updateSecuritySettings: (settings: Partial<SecuritySettings>) => {
    set((state) => {
      const newSecurity = { ...state.security, ...settings };
      saveSecuritySettings(newSecurity);
      // Restart auto-lock timer with new settings
      setupAutoLock(get, newSecurity.autoLockMinutes);
      return { security: newSecurity };
    });
  },

  // Update last activity timestamp
  updateLastActivity: () => {
    set((state) => {
      const newSecurity = { ...state.security, lastActivityAt: Date.now() };
      saveSecuritySettings(newSecurity);
      return { security: newSecurity };
    });
  },

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
  return useWallet(
    useShallow((state) => ({
      isLoading: state.isLoading,
      error: state.error,
    }))
  );
}

// Convenience function: security settings only
export function useSecuritySettings() {
  return useWallet(
    useShallow((state) => ({
      security: state.security,
      updateSecuritySettings: state.updateSecuritySettings,
      updateLastActivity: state.updateLastActivity,
    }))
  );
}

// ============================================
// Security Settings Persistence
// ============================================

const SECURITY_SETTINGS_KEY = 'nasun_wallet_security';

function loadSecuritySettings(): SecuritySettings {
  try {
    const stored = localStorage.getItem(SECURITY_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SECURITY_SETTINGS, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_SECURITY_SETTINGS };
}

function saveSecuritySettings(settings: SecuritySettings): void {
  try {
    localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

// ============================================
// Auto-Lock Timer
// ============================================

/**
 * Set up auto-lock timer that checks for inactivity
 * @param getState - Zustand get function
 * @param autoLockMinutes - Minutes until auto-lock (0 = disabled)
 */
function setupAutoLock(getState: () => WalletStore, autoLockMinutes: number): void {
  // Clear existing timer
  if (autoLockIntervalId) {
    clearInterval(autoLockIntervalId);
    autoLockIntervalId = null;
  }

  // If disabled, don't set up timer
  if (autoLockMinutes <= 0) return;

  // Check every 30 seconds
  autoLockIntervalId = setInterval(() => {
    const state = getState();

    // Only check if wallet is unlocked
    if (state.status !== 'unlocked') return;

    const now = Date.now();
    const timeoutMs = autoLockMinutes * 60 * 1000;
    const lastActivity = state.security.lastActivityAt;

    if (now - lastActivity > timeoutMs) {
      // Auto-lock due to inactivity
      state.lockWallet();
      console.log('[Security] Wallet auto-locked due to inactivity');
    }
  }, 30000); // Check every 30 seconds
}

/**
 * Initialize auto-lock timer (call after store is created)
 */
export function initializeAutoLock(): void {
  const state = useWallet.getState();
  setupAutoLock(useWallet.getState, state.security.autoLockMinutes);
}

/**
 * Clean up auto-lock timer (call on app unmount)
 */
export function cleanupAutoLock(): void {
  if (autoLockIntervalId) {
    clearInterval(autoLockIntervalId);
    autoLockIntervalId = null;
  }
}
