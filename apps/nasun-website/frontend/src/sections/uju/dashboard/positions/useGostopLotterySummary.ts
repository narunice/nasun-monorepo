// useGostopLotterySummary
//
// Cross-app read of the user's GoStop lottery tickets in the *current*
// round. Tickets are `has key, store` and transferred to the buyer on
// purchase (apps/gostop/contracts-lottery/sources/lottery.move ~L156).
// Losing tickets and unclaimed-expired winners linger as zombie objects
// across rounds, so a naive owned-objects count over-reports dramatically
// (a heavy player can accumulate hundreds of stale Ticket objects). The
// gostop lottery page restricts "My Tickets" to the current round and
// this card should match — anything else makes the dashboard look like
// the user has active stake when they don't.
//
// Strategy: query the most recent RoundCreated event to derive the
// current round id, then per registered wallet pull owned Ticket objects
// (with content) and count those whose `round_id` field matches. A
// `round_id` filter cannot be expressed in `getOwnedObjects`, so we read
// content and filter client-side.
//
// Multi-wallet: same pattern as the Pado hooks — union of (signer
// address, registered wallet addresses), dedup, sort for a stable React
// Query key.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { useWallet, useZkLogin } from "@nasun/wallet";
import type { SuiClient } from "@mysten/sui/client";
import {
  GOSTOP_LOTTERY_ROUND_CREATED_EVENT_TYPE,
  GOSTOP_LOTTERY_TICKET_TYPE,
} from "./gostopLotteryConfig";
import { useUjuWalletRegistration } from "../../hooks/useUjuWalletRegistration";

const MAX_PAGES = 20;

async function fetchCurrentRoundId(client: SuiClient): Promise<string | null> {
  const events = await client.queryEvents({
    query: { MoveEventType: GOSTOP_LOTTERY_ROUND_CREATED_EVENT_TYPE },
    limit: 1,
    order: "descending",
  });
  if (events.data.length === 0) return null;
  const p = events.data[0].parsedJson as { round_id?: string };
  return p?.round_id ?? null;
}

async function countCurrentRoundTicketsForAddress(
  client: SuiClient,
  owner: string,
  currentRoundId: string,
): Promise<number> {
  let total = 0;
  let cursor: string | null | undefined = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const resp = await client.getOwnedObjects({
      owner,
      filter: { StructType: GOSTOP_LOTTERY_TICKET_TYPE },
      options: { showContent: true },
      cursor,
      limit: 50,
    });
    for (const o of resp.data) {
      if (!o.data?.content || o.data.content.dataType !== "moveObject") continue;
      const f = o.data.content.fields as Record<string, unknown>;
      if (String(f.round_id ?? "") === currentRoundId) total += 1;
    }
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
      const currentRoundId = await fetchCurrentRoundId(suiClient);
      if (!currentRoundId) return 0;
      const counts = await Promise.all(
        allAddresses.map((addr) =>
          countCurrentRoundTicketsForAddress(suiClient, addr, currentRoundId),
        ),
      );
      return counts.reduce((sum, n) => sum + n, 0);
    },
  });

  return {
    ticketCount: data ?? 0,
    isLoading,
  };
}
