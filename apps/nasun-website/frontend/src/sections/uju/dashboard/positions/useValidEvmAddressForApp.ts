// useValidEvmAddressForApp / useVerifiedEvmAddresses
//
// Per-app verified EVM address binding. Companion to useValidEvmAddress.
//
// Model (see handoff 2026-05-16-per-app-verified-evm-binding.md):
//   - linkedAccounts.metamask.walletAddress is the user's primary verified
//     EVM address (unchanged contract).
//   - linkedAccounts.metamask.additionalAddresses[] holds extra addresses
//     that the user has independently proven ownership of via EIP-191
//     personal_sign. Each entry is { walletAddress, verifiedAt, label? }.
//   - linkedAccounts.metamask.appBindings[appId] points at one of the
//     verified addresses (primary OR an additionalAddresses entry). When
//     a binding is absent (or points at an address that is no longer in
//     the verified set), the primary address is used as fallback.
//
// Both hooks share the same null contract as useValidEvmAddress: they
// return null when the user has no verified primary metamask link
// (manualEntry === true counts as unverified). Cards must gate at the
// section level on these hooks so the underlying queries never fire for
// an unverified address.

import { useMemo } from "react";
import { getAddress, isAddress } from "viem";

import { useUserStore } from "../../../../store/userStore";

export interface VerifiedEvmAddressEntry {
  walletAddress: `0x${string}`;
  verifiedAt: number;
  label?: string;
  isPrimary: boolean;
}

function normalizeIfValid(raw: string | undefined): `0x${string}` | null {
  if (!raw || !isAddress(raw)) return null;
  return getAddress(raw);
}

/**
 * Returns the verified EVM address to use for a specific dApp.
 *
 * Resolution order:
 *   1. If user has no verified primary metamask link → null.
 *   2. If appBindings[appId] is set AND that address is still verified
 *      (matches primary or an additionalAddresses entry) → that address.
 *   3. Otherwise → primary walletAddress.
 *
 * `appId` is a short, stable identifier per dApp (e.g. "uniswap",
 * "hyperliquid"). Use lowercase ascii. Do not include version suffixes.
 */
export function useValidEvmAddressForApp(
  appId: string,
): `0x${string}` | null {
  const meta = useUserStore((s) => s.user?.linkedAccounts?.metamask);
  return useMemo(() => {
    if (!meta) return null;
    if (meta.manualEntry === true) return null;

    const primary = normalizeIfValid(meta.walletAddress);
    if (!primary) return null;

    const verifiedSet = new Set<string>([primary.toLowerCase()]);
    if (Array.isArray(meta.additionalAddresses)) {
      for (const entry of meta.additionalAddresses) {
        const normalized = normalizeIfValid(entry?.walletAddress);
        if (normalized) verifiedSet.add(normalized.toLowerCase());
      }
    }

    const bound = meta.appBindings?.[appId];
    const normalizedBound = normalizeIfValid(bound);
    if (
      normalizedBound &&
      verifiedSet.has(normalizedBound.toLowerCase())
    ) {
      return normalizedBound;
    }

    return primary;
  }, [meta, appId]);
}

/**
 * Returns all verified EVM addresses for the signed-in user, primary
 * first. Empty array (NOT null) when the user has no verified metamask
 * link, so callers can render a single empty-state branch. Use this for
 * the binding picker UI (WalletBindingChip) and the my-account
 * "Additional Wallets" section.
 */
export function useVerifiedEvmAddresses(): VerifiedEvmAddressEntry[] {
  const meta = useUserStore((s) => s.user?.linkedAccounts?.metamask);
  return useMemo(() => {
    if (!meta || meta.manualEntry === true) return [];

    const primary = normalizeIfValid(meta.walletAddress);
    if (!primary) return [];

    const out: VerifiedEvmAddressEntry[] = [
      {
        walletAddress: primary,
        verifiedAt: typeof meta.verifiedAt === "number" ? meta.verifiedAt : 0,
        isPrimary: true,
      },
    ];

    if (Array.isArray(meta.additionalAddresses)) {
      const seen = new Set<string>([primary.toLowerCase()]);
      for (const entry of meta.additionalAddresses) {
        const normalized = normalizeIfValid(entry?.walletAddress);
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          walletAddress: normalized,
          verifiedAt:
            typeof entry.verifiedAt === "number" ? entry.verifiedAt : 0,
          label: entry.label,
          isPrimary: false,
        });
      }
    }

    return out;
  }, [meta]);
}
