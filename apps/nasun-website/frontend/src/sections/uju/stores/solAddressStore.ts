// SOL address store (Zustand). Plan 3A.1.
//
// Ownership: store owns identityId-keyed { solAddress, connectedWallet } and
// localStorage persistence. WalletBalanceCard owns the input/edit UI buffer
// (solInput / solError / solEditing) and the Phantom/Solflare adapter lifecycle.
//
// Self-display only: SOL ownership is NOT cryptographically verified
// (Phantom/Solflare adapters connect without signMessage; manual entry only
// validates base58 format). Do NOT use SOL addresses for ecosystem-points
// authorization or cross-user trust signals. localStorage only — never sent
// to backend.

import { create } from "zustand";
import { isValidSolAddress } from "@/lib/solana";

export type SolWalletProvider = "phantom" | "solflare" | null;

export interface IdentitySolState {
  solAddress: string | null;
  connectedWallet: SolWalletProvider;
}

interface SolAddressStore {
  byIdentity: Record<string, IdentitySolState>;
  setForIdentity: (
    identityId: string,
    addr: string | null,
    wallet: SolWalletProvider,
  ) => void;
  /** Load persisted state from localStorage into the store. Idempotent. */
  hydrateFromStorage: (identityId: string) => void;
}

function solKey(identityId: string) {
  return `uju:sol-address:${identityId}`;
}
function solWalletStorageKey(identityId: string) {
  return `uju:sol-wallet:${identityId}`;
}

export const useSolAddressStore = create<SolAddressStore>((set) => ({
  byIdentity: {},
  setForIdentity: (identityId, addr, wallet) => {
    if (addr && !isValidSolAddress(addr)) {
      throw new Error("Invalid Solana address");
    }
    try {
      if (addr) {
        localStorage.setItem(solKey(identityId), addr);
        if (wallet) {
          localStorage.setItem(solWalletStorageKey(identityId), wallet);
        } else {
          localStorage.removeItem(solWalletStorageKey(identityId));
        }
      } else {
        localStorage.removeItem(solKey(identityId));
        localStorage.removeItem(solWalletStorageKey(identityId));
      }
    } catch {
      /* private browsing / quota — store still updates in-memory */
    }
    set((s) => ({
      byIdentity: {
        ...s.byIdentity,
        [identityId]: { solAddress: addr, connectedWallet: wallet },
      },
    }));
  },
  hydrateFromStorage: (identityId) => {
    try {
      const addr = localStorage.getItem(solKey(identityId));
      const w = localStorage.getItem(solWalletStorageKey(identityId));
      if (addr && isValidSolAddress(addr)) {
        const wallet: SolWalletProvider =
          w === "phantom" || w === "solflare" ? w : null;
        set((s) => ({
          byIdentity: {
            ...s.byIdentity,
            [identityId]: { solAddress: addr, connectedWallet: wallet },
          },
        }));
      }
    } catch {
      /* localStorage unavailable */
    }
  },
}));

// Selector hook — undefined identityId returns null (no throw, no fetch trigger).
// Important for auth-refresh flicker (identityId: string → undefined → string)
// where downstream react-query enabled flag uses solAddress to skip refetch.
export function useSolAddressForIdentity(
  identityId: string | undefined,
): IdentitySolState | null {
  return useSolAddressStore((s) =>
    identityId ? (s.byIdentity[identityId] ?? null) : null,
  );
}
