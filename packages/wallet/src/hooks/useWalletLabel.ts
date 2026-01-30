/**
 * useWalletLabel - Persistent wallet label (alias) store
 *
 * Maps address → user-defined label in localStorage.
 * Used to display friendly names instead of truncated addresses.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const STORAGE_KEY = 'nasun-wallet-labels';
const MAX_LABEL_LENGTH = 20;
const LABEL_PATTERN = /^[a-zA-Z0-9\s\-_.]+$/;

interface WalletLabelStore {
  labels: Record<string, string>;
  getLabel: (address: string) => string | null;
  setLabel: (address: string, label: string) => void;
  removeLabel: (address: string) => void;
}

export const useWalletLabelStore = create<WalletLabelStore>()(
  persist(
    (set, get) => ({
      labels: {},
      getLabel: (address: string) => get().labels[address] ?? null,
      setLabel: (address: string, label: string) => {
        const trimmed = label.trim().slice(0, MAX_LABEL_LENGTH);
        if (!trimmed) return;
        set((state) => ({
          labels: { ...state.labels, [address]: trimmed },
        }));
      },
      removeLabel: (address: string) => {
        set((state) => {
          const { [address]: _, ...rest } = state.labels;
          return { labels: rest };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ labels: state.labels }),
    }
  )
);

/**
 * Hook to get/set wallet label for a specific address.
 */
export function useWalletLabel(address: string | undefined) {
  const { labels, setLabel, removeLabel } = useWalletLabelStore();
  const label = address ? labels[address] ?? null : null;

  return {
    label,
    setLabel: (newLabel: string) => {
      if (!address) return;
      setLabel(address, newLabel);
    },
    removeLabel: () => {
      if (!address) return;
      removeLabel(address);
    },
  };
}

/** Validate a wallet label string */
export function isValidWalletLabel(label: string): boolean {
  const trimmed = label.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_LABEL_LENGTH) return false;
  return LABEL_PATTERN.test(trimmed);
}

export { MAX_LABEL_LENGTH, LABEL_PATTERN };
