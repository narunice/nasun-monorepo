/**
 * NSA Store - Zustand store for Nasun Smart Account state
 *
 * Uses localStorage (persistent across sessions) since SmartAccount
 * association should survive page reloads and browser restarts.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { NsaAccountState, NsaSignerInfo, NsaSignerProposal } from '../types/nsa';

interface NsaStoreState {
  /** SmartAccount object ID (null if not yet created) */
  accountObjectId: string | null;
  /** Cached account state from chain */
  accountState: NsaAccountState | null;
  /** Whether the NSA system is initialized for this user */
  isInitialized: boolean;
  /** Whether account state is being fetched */
  isLoading: boolean;
  /** Last fetch timestamp */
  lastFetchedAt: number | null;
  /** Active recovery request object ID (if any) */
  activeRecoveryId: string | null;
  /** Pending signer proposals for this account */
  pendingProposals: NsaSignerProposal[];
  /** Incoming invitations (proposals where current user is pending signer) */
  incomingInvitations: NsaSignerProposal[];
  /** Wallet address that owns this NSA state (for multi-account safety) */
  ownerAddress: string | null;
}

interface NsaStoreActions {
  /** Set the SmartAccount object ID after creation */
  setAccountObjectId: (objectId: string) => void;
  /** Update cached account state from chain query */
  setAccountState: (state: NsaAccountState) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Set active recovery request */
  setActiveRecovery: (requestId: string | null) => void;
  /** Set pending signer proposals */
  setPendingProposals: (proposals: NsaSignerProposal[]) => void;
  /** Set incoming invitations */
  setIncomingInvitations: (invitations: NsaSignerProposal[]) => void;
  /** Clear all NSA state (logout/reset) */
  clearState: () => void;
  /** Mark as initialized (ownerAddress binds state to a specific wallet) */
  initialize: (objectId: string, state: NsaAccountState, ownerAddress?: string) => void;
  /** Validate persisted state matches the current wallet address */
  validateOwner: (currentAddress: string) => void;
}

type NsaStore = NsaStoreState & NsaStoreActions;

export const useNsaStore = create<NsaStore>()(
  persist(
    (set) => ({
      // State
      accountObjectId: null,
      accountState: null,
      isInitialized: false,
      isLoading: false,
      lastFetchedAt: null,
      activeRecoveryId: null,
      pendingProposals: [],
      incomingInvitations: [],
      ownerAddress: null,

      // Actions
      setAccountObjectId: (objectId) =>
        set({ accountObjectId: objectId }),

      setAccountState: (state) =>
        set({
          accountState: state,
          lastFetchedAt: Date.now(),
        }),

      setLoading: (loading) =>
        set({ isLoading: loading }),

      setActiveRecovery: (requestId) =>
        set({ activeRecoveryId: requestId }),

      setPendingProposals: (proposals) =>
        set({ pendingProposals: proposals }),

      setIncomingInvitations: (invitations) =>
        set({ incomingInvitations: invitations }),

      clearState: () =>
        set({
          accountObjectId: null,
          accountState: null,
          isInitialized: false,
          isLoading: false,
          lastFetchedAt: null,
          activeRecoveryId: null,
          pendingProposals: [],
          incomingInvitations: [],
          ownerAddress: null,
        }),

      initialize: (objectId, state, ownerAddress) =>
        set({
          accountObjectId: objectId,
          accountState: state,
          isInitialized: true,
          lastFetchedAt: Date.now(),
          ...(ownerAddress ? { ownerAddress } : {}),
        }),

      validateOwner: (currentAddress) => {
        const { ownerAddress, isInitialized } = useNsaStore.getState();
        if (isInitialized && ownerAddress && ownerAddress.toLowerCase() !== currentAddress.toLowerCase()) {
          console.warn('[NSA] Wallet address changed, clearing stale NSA state.');
          useNsaStore.getState().clearState();
        }
      },
    }),
    {
      name: 'nasun:nsa',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accountObjectId: state.accountObjectId,
        isInitialized: state.isInitialized,
        activeRecoveryId: state.activeRecoveryId,
        ownerAddress: state.ownerAddress,
      }),
    }
  )
);

// === Selectors ===

export function selectSigners(state: NsaStore): NsaSignerInfo[] {
  return state.accountState?.signers ?? [];
}

export function selectGuardians(state: NsaStore): string[] {
  return state.accountState?.guardians ?? [];
}

export function selectThreshold(state: NsaStore): number {
  return state.accountState?.threshold ?? 0;
}

export function selectIsNsaActive(state: NsaStore): boolean {
  return state.isInitialized && !!state.accountObjectId;
}
