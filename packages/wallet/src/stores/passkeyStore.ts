/**
 * Passkey Global Store
 *
 * Zustand store for passkey wallet state management.
 * All components using usePasskey will share the same state.
 *
 * Unlike zkLoginStore, this does NOT use persist middleware because
 * the keypair (private key) must never be persisted. Wallet metadata
 * (address, credentials) is already persisted via localStorage in
 * core/passkey module — the store only provides global in-memory access.
 */

import { create } from 'zustand';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { PasskeyCredential, PasskeyWalletState } from '../types/passkey';
import { getPasskeyWallet } from '../core/passkey';
import { DEFAULT_SECURITY_SETTINGS } from '../types';

interface PasskeyStoreState {
  /** Current wallet metadata (loaded from localStorage on init) */
  wallet: PasskeyWalletState | null;
  /** Keypair — in-memory only, never persisted */
  keypair: Ed25519Keypair | null;
  /** Wallet address (derived from wallet metadata) */
  address: string | null;
  /** Whether wallet is unlocked (keypair available in memory) */
  isUnlocked: boolean;
  /** Mnemonic pending backup — set BEFORE setUnlocked to survive component unmount */
  pendingMnemonic: string | null;
  /**
   * Credential registered but wallet not yet created (PRF unavailable, waiting for password).
   * Stored in global state so it survives PasskeySetupView unmount/remount (e.g. dropdown close).
   */
  pendingCredential: PasskeyCredential | null;
  /** Timestamp of last passkey signing activity — used for auto-lock */
  lastActivityAt: number;
  /** Set wallet + keypair (after create or unlock) */
  setUnlocked: (wallet: PasskeyWalletState, keypair: Ed25519Keypair) => void;
  /** Set wallet metadata only (from localStorage check, no keypair) */
  setWallet: (wallet: PasskeyWalletState | null) => void;
  /** Store mnemonic pending backup (called before setUnlocked) */
  setPendingMnemonic: (mnemonic: string | null) => void;
  /** Store pending credential when PRF is unavailable and password has not been collected yet */
  setPendingCredential: (credential: PasskeyCredential | null) => void;
  /** Update last activity timestamp (called on each signing operation) */
  updateActivity: () => void;
  /** Lock wallet — clear keypair, keep wallet metadata */
  lock: () => void;
  /** Clear everything — wallet deleted */
  clear: () => void;
}

// Initialize from localStorage so address is available immediately
const initialWallet = getPasskeyWallet();

export const usePasskeyStore = create<PasskeyStoreState>()((set) => ({
  wallet: initialWallet,
  keypair: null,
  address: initialWallet?.address ?? null,
  isUnlocked: false,
  pendingMnemonic: null,
  pendingCredential: null,
  lastActivityAt: Date.now(),
  setUnlocked: (wallet, keypair) => set({
    wallet,
    keypair,
    address: wallet.address,
    isUnlocked: true,
    lastActivityAt: Date.now(),
  }),
  setWallet: (wallet) => set({
    wallet,
    address: wallet?.address ?? null,
  }),
  setPendingMnemonic: (mnemonic) => set({ pendingMnemonic: mnemonic }),
  setPendingCredential: (credential) => set({ pendingCredential: credential }),
  updateActivity: () => set({ lastActivityAt: Date.now() }),
  lock: () => set({
    keypair: null,
    isUnlocked: false,
    pendingMnemonic: null,
    pendingCredential: null,
  }),
  clear: () => set({
    wallet: null,
    keypair: null,
    address: null,
    isUnlocked: false,
    pendingMnemonic: null,
    pendingCredential: null,
    lastActivityAt: Date.now(),
  }),
}));

// ============================================
// Passkey Auto-lock Timer
// ============================================

// Shared localStorage key — same setting as self-custody security settings
const SECURITY_SETTINGS_KEY = 'nasun_wallet_security';

let passkeyAutoLockIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Set up module-level auto-lock timer for passkey wallets.
 * Mirrors setupAutoLock() pattern from useWallet.ts.
 * Reads autoLockMinutes from shared security settings.
 * Only locks the passkey keypair — does NOT clear session password.
 */
function setupPasskeyAutoLock(): void {
  if (passkeyAutoLockIntervalId) {
    clearInterval(passkeyAutoLockIntervalId);
  }
  passkeyAutoLockIntervalId = setInterval(() => {
    const state = usePasskeyStore.getState();
    if (!state.isUnlocked) return;

    let autoLockMinutes = DEFAULT_SECURITY_SETTINGS.autoLockMinutes;
    try {
      const stored = localStorage.getItem(SECURITY_SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        autoLockMinutes = typeof parsed.autoLockMinutes === 'number'
          ? parsed.autoLockMinutes
          : DEFAULT_SECURITY_SETTINGS.autoLockMinutes;
      }
    } catch {
      // Ignore parse errors — use default
    }

    if (autoLockMinutes <= 0) return;
    if (Date.now() - state.lastActivityAt > autoLockMinutes * 60 * 1000) {
      state.lock();
    }
  }, 30_000);
}

setupPasskeyAutoLock();
