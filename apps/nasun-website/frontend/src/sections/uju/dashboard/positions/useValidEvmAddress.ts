// useValidEvmAddress
//
// Single source of truth for "does the signed-in user have a verified EVM
// wallet we can safely query?" Read by every dashboard card that surfaces
// data from an Ethereum-compatible chain.
//
// Returns null when:
//   - no metamask link exists in the user's profile
//   - linkedAccounts.metamask.manualEntry === true (legacy pre-signature link
//     — see 2026-05-16 security fix and feedback_no_unverified_evm.md)
//   - walletAddress is missing or fails viem's isAddress check
//
// Returns a checksum-normalized address when valid. Cards must gate on this
// hook at the section level so the underlying queries never fire for an
// unverified address.

import { useMemo } from "react";
import { getAddress, isAddress } from "viem";

import { useUserStore } from "../../../../store/userStore";

export function useValidEvmAddress(): `0x${string}` | null {
  const meta = useUserStore((s) => s.user?.linkedAccounts?.metamask);
  return useMemo(() => {
    if (!meta) return null;
    if (meta.manualEntry === true) return null;
    const raw = meta.walletAddress;
    if (!raw || !isAddress(raw)) return null;
    return getAddress(raw);
  }, [meta]);
}
