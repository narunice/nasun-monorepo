// useValidSolanaAddress / useValidSolanaAddressForApp / useVerifiedSolanaAddresses
//
// Solana counterpart to `useValidEvmAddress*`. Returns the user's
// signature-verified primary Solana address (and per-app bound address
// or full list) or null when no verified link exists.
//
// Verified contract:
//   - linkedAccounts.solana.walletAddress is the primary (set on first
//     Ed25519 verify, see auth-solana-additional Lambda).
//   - linkedAccounts.solana.additionalAddresses[] holds extras.
//   - linkedAccounts.solana.appBindings[appId] points at one of the
//     verified addresses; falls back to primary when unset or stale.
//   - manualEntry === true marks legacy paste-only entries; treated as
//     UNVERIFIED here. Legacy root `linkedSolanaAddress` is NOT surfaced
//     by these hooks (it does not prove ownership). Callers that need
//     paste-link visibility must read userStore directly.

import { useMemo } from "react";

import { useUserStore } from "@/store/userStore";
import { isValidSolAddress } from "@/lib/solana";

export interface VerifiedSolanaAddressEntry {
  walletAddress: string;
  verifiedAt: number;
  label?: string;
  isPrimary: boolean;
}

function normalizeIfValid(raw: string | undefined): string | null {
  if (!raw || !isValidSolAddress(raw)) return null;
  return raw;
}

export function useValidSolanaAddress(): string | null {
  const sol = useUserStore((s) => s.user?.linkedAccounts?.solana);
  return useMemo(() => {
    if (!sol) return null;
    if (sol.manualEntry === true) return null;
    return normalizeIfValid(sol.walletAddress);
  }, [sol]);
}

/**
 * Returns the verified Solana address bound to `appId` (e.g. "drift"),
 * falling back to the primary when no binding or the bound address is
 * no longer in the verified set.
 */
export function useValidSolanaAddressForApp(appId: string): string | null {
  const sol = useUserStore((s) => s.user?.linkedAccounts?.solana);
  return useMemo(() => {
    if (!sol) return null;
    if (sol.manualEntry === true) return null;

    const primary = normalizeIfValid(sol.walletAddress);
    if (!primary) return null;

    const verifiedSet = new Set<string>([primary]);
    if (Array.isArray(sol.additionalAddresses)) {
      for (const entry of sol.additionalAddresses) {
        const normalized = normalizeIfValid(entry?.walletAddress);
        if (normalized) verifiedSet.add(normalized);
      }
    }

    const bound = sol.appBindings?.[appId];
    const normalizedBound = normalizeIfValid(bound);
    if (normalizedBound && verifiedSet.has(normalizedBound)) {
      return normalizedBound;
    }

    return primary;
  }, [sol, appId]);
}

/** All verified Solana addresses; primary first. Empty when no link. */
export function useVerifiedSolanaAddresses(): VerifiedSolanaAddressEntry[] {
  const sol = useUserStore((s) => s.user?.linkedAccounts?.solana);
  return useMemo(() => {
    if (!sol || sol.manualEntry === true) return [];

    const primary = normalizeIfValid(sol.walletAddress);
    if (!primary) return [];

    const out: VerifiedSolanaAddressEntry[] = [
      {
        walletAddress: primary,
        verifiedAt: typeof sol.verifiedAt === "number" ? sol.verifiedAt : 0,
        isPrimary: true,
      },
    ];

    if (Array.isArray(sol.additionalAddresses)) {
      const seen = new Set<string>([primary]);
      for (const entry of sol.additionalAddresses) {
        const normalized = normalizeIfValid(entry?.walletAddress);
        if (!normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        out.push({
          walletAddress: normalized,
          verifiedAt: typeof entry.verifiedAt === "number" ? entry.verifiedAt : 0,
          label: entry.label,
          isPrimary: false,
        });
      }
    }

    return out;
  }, [sol]);
}
