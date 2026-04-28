// External SUI address store (Zustand). Mirrors solAddressStore design.
//
// Use case: nasun zkLogin/mnemonic keypair derives a SUI address automatically,
// but users may hold real assets on a different SUI mainnet wallet (Sui Wallet,
// Suiet, etc.). This store lets them paste that external address for read-only
// display in Wallet Integration + StakingCard SUI rows.
//
// Self-display only: address ownership is NOT cryptographically verified
// (typed entry, no signature challenge). Display gets an "unverified" badge.
// Do NOT use externally-typed SUI addresses for ecosystem-points authorization
// or cross-user trust signals. localStorage only — never sent to backend.

import { create } from "zustand";

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

function isValidSuiAddress(addr: string): boolean {
  return SUI_ADDRESS_RE.test(addr);
}

export interface IdentitySuiState {
  /** External SUI address pasted by the user (overrides nasun-derived for display). */
  externalAddress: string | null;
}

interface SuiAddressStore {
  byIdentity: Record<string, IdentitySuiState>;
  setExternal: (identityId: string, addr: string | null) => void;
  hydrateFromStorage: (identityId: string) => void;
}

function suiKey(identityId: string) {
  return `uju:sui-external-address:${identityId}`;
}

export const useSuiAddressStore = create<SuiAddressStore>((set) => ({
  byIdentity: {},
  setExternal: (identityId, addr) => {
    if (addr && !isValidSuiAddress(addr)) {
      throw new Error("Invalid SUI address");
    }
    try {
      if (addr) {
        localStorage.setItem(suiKey(identityId), addr);
      } else {
        localStorage.removeItem(suiKey(identityId));
      }
    } catch {
      /* private mode / quota — store still updates in-memory */
    }
    set((s) => ({
      byIdentity: {
        ...s.byIdentity,
        [identityId]: { externalAddress: addr },
      },
    }));
  },
  hydrateFromStorage: (identityId) => {
    try {
      const addr = localStorage.getItem(suiKey(identityId));
      if (addr && isValidSuiAddress(addr)) {
        set((s) => ({
          byIdentity: {
            ...s.byIdentity,
            [identityId]: { externalAddress: addr },
          },
        }));
      }
    } catch {
      /* localStorage unavailable */
    }
  },
}));

/** Selector: returns externalAddress for identity, or null when not set / undefined identity. */
export function useSuiExternalAddress(
  identityId: string | undefined,
): string | null {
  return useSuiAddressStore((s) =>
    identityId ? (s.byIdentity[identityId]?.externalAddress ?? null) : null,
  );
}

export { isValidSuiAddress };
