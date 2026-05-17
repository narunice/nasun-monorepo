// useValidSuiAddress / useValidSuiAddressForApp / useVerifiedSuiAddresses
//
// Sui counterpart to `useValidSolanaAddress*`. Returns the user's
// signature-verified primary Sui address (and per-app bound address
// or full list) or null when no verified link exists.
//
// Verified contract:
//   - linkedAccounts.sui.walletAddress is the primary (set on first
//     personal-message verify, see auth-sui-additional Lambda).
//   - linkedAccounts.sui.additionalAddresses[] holds extras.
//   - linkedAccounts.sui.appBindings[appId] points at one of the
//     verified addresses; falls back to primary when unset or stale.
//   - manualEntry === true marks legacy paste-only entries; treated as
//     UNVERIFIED here. Legacy root `linkedSuiAddress` is NOT surfaced
//     by these hooks (it does not prove ownership) and is scheduled for
//     removal in a follow-up cleanup PR.

import { useMemo } from "react";

import { useUserStore } from "@/store/userStore";

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

function normalizeIfValid(raw: string | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (!SUI_ADDRESS_RE.test(raw)) return null;
  return raw.toLowerCase();
}

export interface VerifiedSuiAddressEntry {
  walletAddress: string;
  verifiedAt: number;
  label?: string;
  isPrimary: boolean;
}

interface SuiLinkedShape {
  walletAddress?: string;
  manualEntry?: boolean;
  verifiedAt?: number;
  additionalAddresses?: Array<{ walletAddress: string; verifiedAt?: number; label?: string }>;
  appBindings?: Record<string, string>;
}

export function useValidSuiAddress(): string | null {
  const sui = useUserStore(
    (s) => s.user?.linkedAccounts?.sui as SuiLinkedShape | undefined,
  );
  return useMemo(() => {
    if (!sui) return null;
    if (sui.manualEntry === true) return null;
    return normalizeIfValid(sui.walletAddress);
  }, [sui]);
}

/**
 * Returns the verified Sui address bound to `appId`, falling back to the
 * primary when no binding or the bound address is no longer in the
 * verified set.
 */
export function useValidSuiAddressForApp(appId: string): string | null {
  const sui = useUserStore(
    (s) => s.user?.linkedAccounts?.sui as SuiLinkedShape | undefined,
  );
  return useMemo(() => {
    if (!sui) return null;
    if (sui.manualEntry === true) return null;

    const primary = normalizeIfValid(sui.walletAddress);
    if (!primary) return null;

    const verifiedSet = new Set<string>([primary]);
    if (Array.isArray(sui.additionalAddresses)) {
      for (const entry of sui.additionalAddresses) {
        const normalized = normalizeIfValid(entry?.walletAddress);
        if (normalized) verifiedSet.add(normalized);
      }
    }

    const bound = sui.appBindings?.[appId];
    const normalizedBound = normalizeIfValid(bound);
    if (normalizedBound && verifiedSet.has(normalizedBound)) {
      return normalizedBound;
    }

    return primary;
  }, [sui, appId]);
}

/** All verified Sui addresses; primary first. Empty when no link. */
export function useVerifiedSuiAddresses(): VerifiedSuiAddressEntry[] {
  const sui = useUserStore(
    (s) => s.user?.linkedAccounts?.sui as SuiLinkedShape | undefined,
  );
  return useMemo(() => {
    if (!sui || sui.manualEntry === true) return [];

    const primary = normalizeIfValid(sui.walletAddress);
    if (!primary) return [];

    const out: VerifiedSuiAddressEntry[] = [
      {
        walletAddress: primary,
        verifiedAt: typeof sui.verifiedAt === "number" ? sui.verifiedAt : 0,
        isPrimary: true,
      },
    ];

    if (Array.isArray(sui.additionalAddresses)) {
      const seen = new Set<string>([primary]);
      for (const entry of sui.additionalAddresses) {
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
  }, [sui]);
}
