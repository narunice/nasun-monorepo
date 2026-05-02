import { useMemo } from "react";
import { useAuth } from "@/features/auth";

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

/**
 * Collect all valid Sui wallet addresses for the signed-in account:
 * the primary nasun wallet plus every additionally registered wallet.
 * Caller passes the already-fetched `registeredWallets` array so this
 * helper stays agnostic about which surface (myAccount / uju) it runs in.
 */
export function useAccountWalletAddresses(
  registeredWallets: Array<{ walletAddress: string }>,
): string[] {
  const { user } = useAuth();
  return useMemo(() => {
    const addrs = new Set<string>();
    const primary =
      user?.linkedAccounts?.["nasun wallet"]?.walletAddress ??
      user?.walletAddress;
    if (primary && SUI_ADDRESS_RE.test(primary)) addrs.add(primary);
    for (const w of registeredWallets) {
      if (SUI_ADDRESS_RE.test(w.walletAddress)) addrs.add(w.walletAddress);
    }
    return [...addrs];
  }, [user, registeredWallets]);
}
