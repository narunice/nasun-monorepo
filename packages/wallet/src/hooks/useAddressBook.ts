/**
 * Address Book Hook
 * Manages known addresses for transaction warnings and server sync
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AddressBook, AddressBookEntry } from '../types';

const STORAGE_KEY = 'nasun-address-book';

interface AddressBookStore {
  addressBook: AddressBook;

  // Check if address is known (not soft-deleted)
  isKnownAddress: (address: string) => boolean;

  // Check if address is trusted (not soft-deleted)
  isTrustedAddress: (address: string) => boolean;

  // Get address entry (returns undefined if soft-deleted)
  getEntry: (address: string) => AddressBookEntry | undefined;

  // Add or update address after successful transaction
  recordTransaction: (address: string, label?: string) => void;

  // Manually add a new address to the address book
  addAddress: (address: string, label?: string) => void;

  // Mark address as trusted
  trustAddress: (address: string) => void;

  // Remove trust from address
  untrustAddress: (address: string) => void;

  // Update address label
  updateLabel: (address: string, label: string) => void;

  // Soft-delete address from book
  removeAddress: (address: string) => void;

  // Get all active entries (excludes soft-deleted)
  getAllEntries: () => AddressBookEntry[];

  // Clear all entries (for wallet deletion/logout)
  clearAll: () => void;

  // Merge remote entries with local (for server sync)
  mergeEntries: (remote: Record<string, AddressBookEntry>) => void;

  // Replace all entries (for initial server load)
  setEntries: (entries: Record<string, AddressBookEntry>) => void;
}

/**
 * Get active entry (not soft-deleted), with fallback for legacy data missing new fields
 */
function getActiveEntry(entries: Record<string, AddressBookEntry>, normalized: string): AddressBookEntry | undefined {
  const entry = entries[normalized];
  if (!entry || entry.deletedAt) return undefined;
  return entry;
}

/**
 * Merge a single entry field-by-field using per-field timestamps.
 */
function mergeEntry(local: AddressBookEntry, remote: AddressBookEntry): AddressBookEntry {
  const localLabelAt = local.labelUpdatedAt ?? 0;
  const remoteLabelAt = remote.labelUpdatedAt ?? 0;
  const localTrustAt = local.trustedUpdatedAt ?? 0;
  const remoteTrustAt = remote.trustedUpdatedAt ?? 0;

  return {
    address: local.address,
    label: remoteLabelAt > localLabelAt ? remote.label : local.label,
    labelUpdatedAt: Math.max(localLabelAt, remoteLabelAt),
    firstTransactionAt: Math.min(local.firstTransactionAt, remote.firstTransactionAt),
    lastTransactionAt: Math.max(local.lastTransactionAt, remote.lastTransactionAt),
    transactionCount: Math.max(local.transactionCount, remote.transactionCount),
    isTrusted: remoteTrustAt > localTrustAt ? remote.isTrusted : local.isTrusted,
    trustedUpdatedAt: Math.max(localTrustAt, remoteTrustAt),
    // For deletedAt: if either side deleted it more recently, honor that
    deletedAt: resolveDeletedAt(local.deletedAt, remote.deletedAt),
  };
}

function resolveDeletedAt(localDel?: number, remoteDel?: number): number | undefined {
  if (!localDel && !remoteDel) return undefined;
  // Take the most recent action (delete or restore)
  // If one side has deletedAt and other doesn't, the one with higher timestamp wins
  return Math.max(localDel ?? 0, remoteDel ?? 0) || undefined;
}

export const useAddressBook = create<AddressBookStore>()(
  persist(
    (set, get) => ({
      addressBook: {
        entries: {},
        updatedAt: Date.now(),
      },

      isKnownAddress: (address: string) => {
        const normalized = address.toLowerCase();
        return !!getActiveEntry(get().addressBook.entries, normalized);
      },

      isTrustedAddress: (address: string) => {
        const normalized = address.toLowerCase();
        const entry = getActiveEntry(get().addressBook.entries, normalized);
        return entry?.isTrusted ?? false;
      },

      getEntry: (address: string) => {
        const normalized = address.toLowerCase();
        return getActiveEntry(get().addressBook.entries, normalized);
      },

      recordTransaction: (address: string, label?: string) => {
        const normalized = address.toLowerCase();
        const now = Date.now();

        set((state) => {
          const existingEntry = state.addressBook.entries[normalized];

          const labelChanged = label && label !== existingEntry?.label;

          const newEntry: AddressBookEntry = existingEntry
            ? {
                ...existingEntry,
                lastTransactionAt: now,
                transactionCount: existingEntry.transactionCount + 1,
                label: label || existingEntry.label,
                labelUpdatedAt: labelChanged ? now : (existingEntry.labelUpdatedAt ?? 0),
                trustedUpdatedAt: existingEntry.trustedUpdatedAt ?? 0,
                deletedAt: undefined, // Restore if soft-deleted
              }
            : {
                address: normalized,
                label,
                labelUpdatedAt: now,
                firstTransactionAt: now,
                lastTransactionAt: now,
                transactionCount: 1,
                isTrusted: false,
                trustedUpdatedAt: now,
              };

          return {
            addressBook: {
              entries: {
                ...state.addressBook.entries,
                [normalized]: newEntry,
              },
              updatedAt: now,
            },
          };
        });
      },

      addAddress: (address: string, label?: string) => {
        const normalized = address.toLowerCase();
        const now = Date.now();

        set((state) => {
          const existing = state.addressBook.entries[normalized];
          // Skip if already exists and not soft-deleted
          if (existing && !existing.deletedAt) {
            return state;
          }

          return {
            addressBook: {
              entries: {
                ...state.addressBook.entries,
                [normalized]: {
                  address: normalized,
                  label,
                  labelUpdatedAt: now,
                  firstTransactionAt: now,
                  lastTransactionAt: now,
                  transactionCount: 0,
                  isTrusted: false,
                  trustedUpdatedAt: now,
                },
              },
              updatedAt: now,
            },
          };
        });
      },

      trustAddress: (address: string) => {
        const normalized = address.toLowerCase();
        const now = Date.now();

        set((state) => {
          const entry = getActiveEntry(state.addressBook.entries, normalized);
          if (!entry) return state;

          return {
            addressBook: {
              entries: {
                ...state.addressBook.entries,
                [normalized]: {
                  ...entry,
                  isTrusted: true,
                  trustedUpdatedAt: now,
                },
              },
              updatedAt: now,
            },
          };
        });
      },

      untrustAddress: (address: string) => {
        const normalized = address.toLowerCase();
        const now = Date.now();

        set((state) => {
          const entry = getActiveEntry(state.addressBook.entries, normalized);
          if (!entry) return state;

          return {
            addressBook: {
              entries: {
                ...state.addressBook.entries,
                [normalized]: {
                  ...entry,
                  isTrusted: false,
                  trustedUpdatedAt: now,
                },
              },
              updatedAt: now,
            },
          };
        });
      },

      updateLabel: (address: string, label: string) => {
        const normalized = address.toLowerCase();
        const now = Date.now();

        set((state) => {
          const entry = getActiveEntry(state.addressBook.entries, normalized);
          if (!entry) return state;

          return {
            addressBook: {
              entries: {
                ...state.addressBook.entries,
                [normalized]: {
                  ...entry,
                  label,
                  labelUpdatedAt: now,
                },
              },
              updatedAt: now,
            },
          };
        });
      },

      removeAddress: (address: string) => {
        const normalized = address.toLowerCase();
        const now = Date.now();

        set((state) => {
          const entry = state.addressBook.entries[normalized];
          if (!entry) return state;

          return {
            addressBook: {
              entries: {
                ...state.addressBook.entries,
                [normalized]: { ...entry, deletedAt: now },
              },
              updatedAt: now,
            },
          };
        });
      },

      getAllEntries: () => {
        return Object.values(get().addressBook.entries).filter(e => !e.deletedAt);
      },

      clearAll: () => {
        set({
          addressBook: {
            entries: {},
            updatedAt: Date.now(),
          },
        });
      },

      mergeEntries: (remote: Record<string, AddressBookEntry>) => {
        set((state) => {
          const local = state.addressBook.entries;
          const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);
          const merged: Record<string, AddressBookEntry> = {};
          let changed = false;

          for (const key of allKeys) {
            const localEntry = local[key];
            const remoteEntry = remote[key];

            if (localEntry && remoteEntry) {
              const result = mergeEntry(localEntry, remoteEntry);
              merged[key] = result;
              if (JSON.stringify(result) !== JSON.stringify(localEntry)) {
                changed = true;
              }
            } else if (localEntry) {
              merged[key] = localEntry;
            } else {
              merged[key] = remoteEntry;
              changed = true;
            }
          }

          if (!changed) return state;

          return {
            addressBook: {
              entries: merged,
              updatedAt: Date.now(),
            },
          };
        });
      },

      setEntries: (entries: Record<string, AddressBookEntry>) => {
        set({
          addressBook: {
            entries,
            updatedAt: Date.now(),
          },
        });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ addressBook: state.addressBook }),
    }
  )
);

/**
 * Clear address book (for wallet deletion)
 * Can be called outside of React components
 */
export function clearAddressBook(): void {
  useAddressBook.getState().clearAll();
}

// Convenience hook for checking address status
export function useAddressStatus(address: string) {
  const { isKnownAddress, isTrustedAddress, getEntry } = useAddressBook();

  return {
    isKnown: address ? isKnownAddress(address) : false,
    isTrusted: address ? isTrustedAddress(address) : false,
    entry: address ? getEntry(address) : undefined,
  };
}
