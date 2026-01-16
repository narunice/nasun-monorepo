/**
 * ZK-ID Global Store
 *
 * Zustand store for ZK-ID state management.
 * Manages proofs, credentials, and loading states.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ZKClaimType,
  ZKIDError,
  ZKIDProofEntry,
  ZKIDLoadingState,
  ZKIDErrorState,
} from '../core/zkid/types';

// ============================================
// Store State Types
// ============================================

interface ZKIDStoreState {
  /** Stored proofs by type */
  proofs: Partial<Record<ZKClaimType, ZKIDProofEntry>>;
  /** Loading state by type */
  loading: ZKIDLoadingState;
  /** Error state by type */
  errors: ZKIDErrorState;
  /** Active credential ID for proof generation */
  activeCredentialId: string | null;
}

interface ZKIDStoreActions {
  /** Store a proof */
  setProof: (type: ZKClaimType, entry: ZKIDProofEntry) => void;
  /** Get a proof by type */
  getProof: (type: ZKClaimType) => ZKIDProofEntry | null;
  /** Check if a valid proof exists */
  hasValidProof: (type: ZKClaimType) => boolean;
  /** Remove a proof */
  removeProof: (type: ZKClaimType) => void;
  /** Clear all proofs */
  clearAllProofs: () => void;
  /** Set loading state */
  setLoading: (type: ZKClaimType, isLoading: boolean) => void;
  /** Set error state */
  setError: (type: ZKClaimType, error: ZKIDError | null) => void;
  /** Clear all errors */
  clearErrors: () => void;
  /** Set active credential */
  setActiveCredential: (id: string | null) => void;
  /** Remove expired proofs */
  removeExpiredProofs: () => number;
}

type ZKIDStore = ZKIDStoreState & ZKIDStoreActions;

// ============================================
// Initial State
// ============================================

const initialLoadingState: ZKIDLoadingState = {
  age_over: false,
  kyc_completed: false,
  unique_claim: false,
  custom: false,
};

const initialErrorState: ZKIDErrorState = {
  age_over: null,
  kyc_completed: null,
  unique_claim: null,
  custom: null,
};

// ============================================
// Store Implementation
// ============================================

export const useZKIDStore = create<ZKIDStore>()(
  persist(
    (set, get) => ({
      // State
      proofs: {},
      loading: initialLoadingState,
      errors: initialErrorState,
      activeCredentialId: null,

      // Actions
      setProof: (type, entry) =>
        set((state) => ({
          proofs: {
            ...state.proofs,
            [type]: entry,
          },
          errors: {
            ...state.errors,
            [type]: null,
          },
        })),

      getProof: (type) => {
        const entry = get().proofs[type];
        if (!entry) return null;

        // Check expiration
        if (entry.proof.expiresAt < Date.now()) {
          // Auto-remove expired proof
          get().removeProof(type);
          return null;
        }

        return entry;
      },

      hasValidProof: (type) => {
        const entry = get().proofs[type];
        if (!entry) return false;
        return entry.proof.expiresAt >= Date.now();
      },

      removeProof: (type) =>
        set((state) => {
          const { [type]: _, ...rest } = state.proofs;
          return { proofs: rest };
        }),

      clearAllProofs: () =>
        set({
          proofs: {},
          errors: initialErrorState,
        }),

      setLoading: (type, isLoading) =>
        set((state) => ({
          loading: {
            ...state.loading,
            [type]: isLoading,
          },
        })),

      setError: (type, error) =>
        set((state) => ({
          errors: {
            ...state.errors,
            [type]: error,
          },
        })),

      clearErrors: () =>
        set({
          errors: initialErrorState,
        }),

      setActiveCredential: (id) =>
        set({
          activeCredentialId: id,
        }),

      removeExpiredProofs: () => {
        const { proofs } = get();
        const now = Date.now();
        let removed = 0;

        const validProofs: Partial<Record<ZKClaimType, ZKIDProofEntry>> = {};

        for (const [type, entry] of Object.entries(proofs)) {
          if (entry && entry.proof.expiresAt >= now) {
            validProofs[type as ZKClaimType] = entry;
          } else {
            removed++;
          }
        }

        if (removed > 0) {
          set({ proofs: validProofs });
        }

        return removed;
      },
    }),
    {
      name: 'nasun:zkid',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist proofs, not loading/error states
      partialize: (state) => ({
        proofs: state.proofs,
        activeCredentialId: state.activeCredentialId,
      }),
    }
  )
);

// ============================================
// Selector Hooks
// ============================================

/**
 * Select proof by type
 */
export function useZKIDProof(type: ZKClaimType): ZKIDProofEntry | null {
  return useZKIDStore((state) => state.getProof(type));
}

/**
 * Select loading state by type
 */
export function useZKIDLoading(type: ZKClaimType): boolean {
  return useZKIDStore((state) => state.loading[type]);
}

/**
 * Select error state by type
 */
export function useZKIDError(type: ZKClaimType): ZKIDError | null {
  return useZKIDStore((state) => state.errors[type]);
}

/**
 * Check if any proof generation is in progress
 */
export function useZKIDAnyLoading(): boolean {
  return useZKIDStore((state) =>
    Object.values(state.loading).some((v) => v)
  );
}

/**
 * Get all valid proofs
 */
export function useZKIDAllProofs(): Partial<Record<ZKClaimType, ZKIDProofEntry>> {
  return useZKIDStore((state) => {
    const now = Date.now();
    const valid: Partial<Record<ZKClaimType, ZKIDProofEntry>> = {};

    for (const [type, entry] of Object.entries(state.proofs)) {
      if (entry && entry.proof.expiresAt >= now) {
        valid[type as ZKClaimType] = entry;
      }
    }

    return valid;
  });
}
