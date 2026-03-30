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
  exportMnemonic as exportMnemonicFromKeystore,
} from '../core/keystore';
import { createEVMWalletFromMnemonic, deleteEVMWallet } from '../core/evm';
import { clearAddressBook } from './useAddressBook';
import { getPublicKeyFromKeypair, getAddressFromKeypair, getSecretKeyFromKeypair } from '../core/crypto';
import { saveSessionPassword, getSessionPassword, clearSessionPassword } from '../sui/client';
import { useChainStore } from './useChain';

// Event emitted when wallet identity changes (create/import).
// Consumers (e.g., auth providers) should listen and clear stale sessions.
export const WALLET_IDENTITY_CHANGED_EVENT = "nasun-wallet-identity-changed";

// Internal state (keypair is not stored in the store)
let currentKeypair: Ed25519Keypair | null = null;

// Auto-lock interval ID
let autoLockIntervalId: ReturnType<typeof setInterval> | null = null;

// Pending mnemonic for backup display (module-level to survive component unmount/remount)
let pendingBackupMnemonic: string | null = null;

/**
 * Get the pending mnemonic for backup display (non-destructive read).
 */
export function getPendingBackupMnemonic(): string | null {
  return pendingBackupMnemonic;
}

/**
 * Clear the pending mnemonic after user confirms backup.
 */
export function clearPendingBackupMnemonic(): void {
  pendingBackupMnemonic = null;
}

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

// ============================================
// Shared import helpers (reduce code duplication)
// ============================================
type SetFn = (partial: Partial<WalletStore>) => void;

async function _unlockAndActivate(
  set: SetFn,
  address: string,
  password: string,
  mnemonic?: string,
): Promise<void> {
  const keypair = await unlockKeystore(password);
  currentKeypair = keypair;
  saveSessionPassword(password);

  // Auto-create EVM wallet when mnemonic is available
  if (mnemonic) {
    try {
      await createEVMWalletFromMnemonic(mnemonic, password);
    } catch {
      // EVM wallet creation is optional; log silently
    }
  }

  const account: WalletAccount = {
    address,
    publicKey: getPublicKeyFromKeypair(keypair),
  };
  set({ status: 'unlocked', account, isLoading: false });
}

async function _importWithMnemonic(
  set: SetFn,
  mnemonic: string,
  password: string,
): Promise<string> {
  set({ isLoading: true, error: null });
  try {
    window.dispatchEvent(new Event(WALLET_IDENTITY_CHANGED_EVENT));
    const address = await importWalletFromMnemonic(mnemonic, password);
    await _unlockAndActivate(set, address, password, mnemonic);
    return address;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import wallet';
    set({ isLoading: false, error: message });
    throw error;
  }
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
    const hasKS = hasKeystore();
    const address = getStoredAddress();
    const sessionPwd = getSessionPassword();

    if (hasKS) {
      if (address) {
        // Try auto-unlock from session
        if (sessionPwd) {
          try {
            const keypair = await unlockKeystore(sessionPwd);
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
      window.dispatchEvent(new Event(WALLET_IDENTITY_CHANGED_EVENT));

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
    pendingBackupMnemonic = null;
    clearSessionPassword();
    // Reset chain to default (Nasun Devnet) on lock
    useChainStore.getState().resetToDefault();
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
    deleteEVMWallet();
    clearAddressBook();

    // Reset UI settings to defaults
    localStorage.removeItem('nasun-wallet-ui-settings');
    localStorage.removeItem('nasun-wallet-chain');

    set({
      status: 'disconnected',
      account: null,
      error: null,
    });
  },

  // Import from mnemonic (legacy compatible)
  importWallet: async (mnemonic: string, password: string): Promise<string> => {
    return _importWithMnemonic(set, mnemonic, password);
  },

  // Create wallet with mnemonic backup
  createWalletWithBackup: async (password: string): Promise<{ address: string; mnemonic: string }> => {
    set({ isLoading: true, error: null });
    try {
      window.dispatchEvent(new Event(WALLET_IDENTITY_CHANGED_EVENT));
      const { address, mnemonic } = await createWalletWithMnemonic(password);

      // Store mnemonic BEFORE status change — React may re-render immediately
      // when _unlockAndActivate sets status to "unlocked", causing WalletConnect
      // to unmount (e.g., Pado homepage WelcomeBanner) and remount in Header.
      // The new instance reads this on mount to restore the backup flow.
      pendingBackupMnemonic = mnemonic;

      await _unlockAndActivate(set, address, password, mnemonic);

      return { address, mnemonic };
    } catch (error) {
      pendingBackupMnemonic = null;
      const message = error instanceof Error ? error.message : 'Failed to create wallet';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  // Import from mnemonic (explicit method)
  importFromMnemonic: async (mnemonic: string, password: string): Promise<string> => {
    return _importWithMnemonic(set, mnemonic, password);
  },

  // Import from private key (no EVM wallet -- no mnemonic available)
  importFromPrivateKey: async (privateKey: string, password: string): Promise<string> => {
    set({ isLoading: true, error: null });
    try {
      window.dispatchEvent(new Event(WALLET_IDENTITY_CHANGED_EVENT));
      const address = await importWalletFromPrivateKey(privateKey, password);
      await _unlockAndActivate(set, address, password);
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

  // Export mnemonic (requires password verification, null if not stored)
  exportMnemonic: async (password: string): Promise<string | null> => {
    try {
      return await exportMnemonicFromKeystore(password);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export mnemonic';
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
