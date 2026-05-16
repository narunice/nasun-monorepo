// usePadoBalanceManagers
//
// Cross-app discovery of the user's Pado BalanceManager (BM) object IDs from
// Sui RPC. Both usePadoSpotOrdersSummary and usePadoBalanceSummary need the
// same BM set, so we share the result through a stable react-query cache
// key ("pado-bm-ids", addressesKey) — the second consumer is a free dedup.
//
// Discovery rationale (see usePadoSpotOrdersSummary for the long-form note):
// BMs are shared objects so getOwnedObjects can't surface them. We sweep
// BalanceManagerEvent emitted at creation, in both directions (asc + desc)
// in parallel, to catch primary BMs (often first) and recent ones without
// scanning the entire history.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { DEEPBOOK_PACKAGE_ID } from "@nasun/devnet-config";
import type { SuiClient } from "@mysten/sui/client";
import { useUjuWalletRegistration } from "../../hooks/useUjuWalletRegistration";

const BM_EVENT_TYPE = `${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManagerEvent`;
const MAX_EVENT_PAGES = 50;

interface BalanceManagerEventPayload {
  balance_manager_id?: string;
  owner?: string;
}

interface DirectionalSweep {
  ids: string[];
  truncated: boolean;
}

async function sweepBmEventsOneDirection(
  client: SuiClient,
  owner: string,
  order: "ascending" | "descending",
): Promise<DirectionalSweep> {
  const ids: string[] = [];
  let cursor: { txDigest: string; eventSeq: string } | null | undefined = undefined;
  let truncated = true;
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const response = await client.queryEvents({
      query: { Sender: owner },
      cursor,
      limit: 50,
      order,
    });
    for (const event of response.data) {
      if (event.type !== BM_EVENT_TYPE) continue;
      const json = event.parsedJson as BalanceManagerEventPayload | undefined;
      const id = json?.balance_manager_id;
      if (id && (!json?.owner || json.owner === owner)) {
        ids.push(id);
      }
    }
    if (!response.hasNextPage || !response.nextCursor) {
      truncated = false;
      break;
    }
    cursor = response.nextCursor;
  }
  return { ids, truncated };
}

async function findBalanceManagerIds(
  client: SuiClient,
  owner: string,
): Promise<{ ids: string[]; partial: boolean }> {
  const [asc, desc] = await Promise.all([
    sweepBmEventsOneDirection(client, owner, "ascending"),
    sweepBmEventsOneDirection(client, owner, "descending"),
  ]);
  return {
    ids: Array.from(new Set([...asc.ids, ...desc.ids])),
    partial: asc.truncated && desc.truncated,
  };
}

export interface PadoBalanceManagersResult {
  bmIds: string[];
  // True when at least one address's BM event sweep hit MAX_EVENT_PAGES on
  // both directions without converging — a middle window of history is
  // unscanned and may hide additional BMs.
  partial: boolean;
  addresses: string[];
  isLoading: boolean;
}

export function usePadoBalanceManagers(): PadoBalanceManagersResult {
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
    queryKey: ["pado-bm-ids", addressesKey],
    enabled: allAddresses.length > 0,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<{ bmIds: string[]; partial: boolean }> => {
      if (allAddresses.length === 0) return { bmIds: [], partial: false };
      const bmResults = await Promise.all(
        allAddresses.map((addr) => findBalanceManagerIds(suiClient, addr)),
      );
      const bmIds = Array.from(new Set(bmResults.flatMap((r) => r.ids)));
      const partial = bmResults.some((r) => r.partial);
      return { bmIds, partial };
    },
  });

  return {
    bmIds: data?.bmIds ?? [],
    partial: data?.partial ?? false,
    addresses: allAddresses,
    isLoading,
  };
}
