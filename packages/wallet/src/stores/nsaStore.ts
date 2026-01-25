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
  /** Mark as initialized */
  initialize: (objectId: string, state: NsaAccountState) => void;
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
        }),

      initialize: (objectId, state) =>
        set({
          accountObjectId: objectId,
          accountState: state,
          isInitialized: true,
          lastFetchedAt: Date.now(),
        }),
    }),
    {
      name: 'nasun:nsa',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accountObjectId: state.accountObjectId,
        isInitialized: state.isInitialized,
        activeRecoveryId: state.activeRecoveryId,
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
