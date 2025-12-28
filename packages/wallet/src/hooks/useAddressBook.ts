/**
 * Address Book Hook
 * Manages known addresses for transaction warnings
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AddressBook, AddressBookEntry } from '../types';

const STORAGE_KEY = 'nasun-address-book';

interface AddressBookStore {
  addressBook: AddressBook;

  // Check if address is known (has previous transactions)
  isKnownAddress: (address: string) => boolean;

  // Check if address is trusted
  isTrustedAddress: (address: string) => boolean;

  // Get address entry
  getEntry: (address: string) => AddressBookEntry | undefined;

  // Add or update address after successful transaction
  recordTransaction: (address: string, label?: string) => void;

  // Mark address as trusted
  trustAddress: (address: string) => void;

  // Remove trust from address
  untrustAddress: (address: string) => void;

  // Update address label
  updateLabel: (address: string, label: string) => void;

  // Remove address from book
  removeAddress: (address: string) => void;

  // Get all entries
  getAllEntries: () => AddressBookEntry[];
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
        return normalized in get().addressBook.entries;
      },

      isTrustedAddress: (address: string) => {
        const normalized = address.toLowerCase();
        const entry = get().addressBook.entries[normalized];
        return entry?.isTrusted ?? false;
      },

      getEntry: (address: string) => {
        const normalized = address.toLowerCase();
        return get().addressBook.entries[normalized];
      },

      recordTransaction: (address: string, label?: string) => {
        const normalized = address.toLowerCase();
        const now = Date.now();

        set((state) => {
          const existingEntry = state.addressBook.entries[normalized];

          const newEntry: AddressBookEntry = existingEntry
            ? {
                ...existingEntry,
                lastTransactionAt: now,
                transactionCount: existingEntry.transactionCount + 1,
                label: label || existingEntry.label,
              }
            : {
                address: normalized,
                label,
                firstTransactionAt: now,
                lastTransactionAt: now,
                transactionCount: 1,
                isTrusted: false,
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

      trustAddress: (address: string) => {
        const normalized = address.toLowerCase();

        set((state) => {
          const entry = state.addressBook.entries[normalized];
          if (!entry) return state;

          return {
            addressBook: {
              entries: {
                ...state.addressBook.entries,
                [normalized]: { ...entry, isTrusted: true },
              },
              updatedAt: Date.now(),
            },
          };
        });
      },

      untrustAddress: (address: string) => {
        const normalized = address.toLowerCase();

        set((state) => {
          const entry = state.addressBook.entries[normalized];
          if (!entry) return state;

          return {
            addressBook: {
              entries: {
                ...state.addressBook.entries,
                [normalized]: { ...entry, isTrusted: false },
              },
              updatedAt: Date.now(),
            },
          };
        });
      },

      updateLabel: (address: string, label: string) => {
        const normalized = address.toLowerCase();

        set((state) => {
          const entry = state.addressBook.entries[normalized];
          if (!entry) return state;

          return {
            addressBook: {
              entries: {
                ...state.addressBook.entries,
                [normalized]: { ...entry, label },
              },
              updatedAt: Date.now(),
            },
          };
        });
      },

      removeAddress: (address: string) => {
        const normalized = address.toLowerCase();

        set((state) => {
          const { [normalized]: _, ...rest } = state.addressBook.entries;
          return {
            addressBook: {
              entries: rest,
              updatedAt: Date.now(),
            },
          };
        });
      },

      getAllEntries: () => {
        return Object.values(get().addressBook.entries);
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ addressBook: state.addressBook }),
    }
  )
);

// Convenience hook for checking address status
export function useAddressStatus(address: string) {
  const { isKnownAddress, isTrustedAddress, getEntry } = useAddressBook();

  return {
    isKnown: address ? isKnownAddress(address) : false,
    isTrusted: address ? isTrustedAddress(address) : false,
    entry: address ? getEntry(address) : undefined,
  };
}
