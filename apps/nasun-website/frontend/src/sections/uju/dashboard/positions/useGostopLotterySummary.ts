// useGostopLotterySummary
//
// Cross-app read of the user's GoStop lottery tickets. Returns the total
// count of owned Ticket objects across every registered wallet so the
// dashboard card can answer "do I have anything riding on the lottery
// right now". Talks to Sui RPC directly so we don't drag GoStop's lottery
// client into nasun-website.
//
// Discovery: Ticket is `has key, store` and transferred to the buyer on
// purchase (apps/gostop/contracts-lottery/sources/lottery.move ~L156), so
// `getOwnedObjects` with a StructType filter on the lottery's original
// package id is the canonical lookup. The original package id is stable
// across upgrades — see gostopLotteryConfig.ts for the sync rule.
//
// What "active" means here: any Ticket the wallet still holds. Tickets are
// consumed (object destroyed) by `claim_prize` for winning tiers; losing
// tickets and unclaimed-expired winners linger as zombie objects. We do
// not currently distinguish those — surfacing the raw count keeps this PR
// scoped and leaves the user one click away from gostop.app, which is the
// authoritative source for round status and claimable amounts. A future
// PR can fetch the matching LotteryRound per ticket to derive a
// "claimable now" number, but that adds N round fetches + tier-matching
// math and is not justified by a summary card.
//
// Multi-wallet: same pattern as the Pado hooks — union of (signer address,
// registered wallet addresses), dedup, sort for a stable React Query key.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { useWallet, useZkLogin } from "@nasun/wallet";
import type { SuiClient } from "@mysten/sui/client";
import { GOSTOP_LOTTERY_TICKET_TYPE } from "./gostopLotteryConfig";
import { useUjuWalletRegistration } from "../../hooks/useUjuWalletRegistration";

const MAX_PAGES = 20;

async function countTicketsForAddress(
  client: SuiClient,
  owner: string,
): Promise<number> {
  let total = 0;
  let cursor: string | null | undefined = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const resp = await client.getOwnedObjects({
      owner,
      filter: { StructType: GOSTOP_LOTTERY_TICKET_TYPE },
      // We only need the count; skip showContent to keep payloads light.
      options: { showType: false, showContent: false },
      cursor,
      limit: 50,
    });
    total += resp.data.length;
    if (!resp.hasNextPage || !resp.nextCursor) break;
    cursor = resp.nextCursor;
  }
  return total;
}

export interface GostopLotterySummary {
  ticketCount: number;
  isLoading: boolean;
}

export function useGostopLotterySummary(): GostopLotterySummary {
  const suiClient = useSuiClient();
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const walletReg = useUjuWalletRegistration();

  const signerAddress = isZkConnected
    ? zkState?.address
    : status === "unlocked"
      ? account?.address
      : undefined;

  const allAddresses = useMemo(() => {
    const set = new Set<string>();
    if (signerAddress) set.add(signerAddress);
    for (const w of walletReg.registeredWallets) {
      if (w.walletAddress) set.add(w.walletAddress);
    }
    return Array.from(set).sort();
  }, [signerAddress, walletReg.registeredWallets]);

  const addressesKey = allAddresses.join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["gostop-lottery-summary", addressesKey],
    enabled: allAddresses.length > 0,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<number> => {
      if (allAddresses.length === 0) return 0;
      const counts = await Promise.all(
        allAddresses.map((addr) => countTicketsForAddress(suiClient, addr)),
      );
      return counts.reduce((sum, n) => sum + n, 0);
    },
  });

  return {
    ticketCount: data ?? 0,
    isLoading,
  };
}
