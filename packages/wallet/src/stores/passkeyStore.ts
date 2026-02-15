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
import type { PasskeyWalletState } from '../types/passkey';
import { getPasskeyWallet } from '../core/passkey';

interface PasskeyStoreState {
  /** Current wallet metadata (loaded from localStorage on init) */
  wallet: PasskeyWalletState | null;
  /** Keypair — in-memory only, never persisted */
  keypair: Ed25519Keypair | null;
  /** Wallet address (derived from wallet metadata) */
  address: string | null;
  /** Whether wallet is unlocked (keypair available in memory) */
  isUnlocked: boolean;
  /** Set wallet + keypair (after create or unlock) */
  setUnlocked: (wallet: PasskeyWalletState, keypair: Ed25519Keypair) => void;
  /** Set wallet metadata only (from localStorage check, no keypair) */
  setWallet: (wallet: PasskeyWalletState | null) => void;
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
  setUnlocked: (wallet, keypair) => set({
    wallet,
    keypair,
    address: wallet.address,
    isUnlocked: true,
  }),
  setWallet: (wallet) => set({
    wallet,
    address: wallet?.address ?? null,
  }),
  lock: () => set({
    keypair: null,
    isUnlocked: false,
  }),
  clear: () => set({
    wallet: null,
    keypair: null,
    address: null,
    isUnlocked: false,
  }),
}));
