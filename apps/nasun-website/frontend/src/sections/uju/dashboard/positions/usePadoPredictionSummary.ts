// usePadoPredictionSummary
//
// Lightweight cross-app read of the user's open Pado prediction-market
// positions. Returns just the two summary numbers the dashboard card needs
// (count + total cost basis in NUSDC) so we don't pull Pado's full Position
// rendering machinery into nasun-website. Talks to Sui RPC directly and only
// depends on @nasun/devnet-config + @nasun/wallet, both already available
// here.
//
// Multi-wallet: nasun-website lets a user register additional Sui wallets
// alongside their primary signer. We fan out across the union of (signer
// address, registered wallet addresses) so a user who signs in with one
// wallet but trades from another still sees their full position surface.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { PREDICTION } from "@nasun/devnet-config";
import type { SuiClient, SuiObjectResponse } from "@mysten/sui/client";
import { useUjuWalletRegistration } from "../../hooks/useUjuWalletRegistration";

const POSITION_TYPE = `${PREDICTION.packageId}::prediction_market::Position`;
const NUSDC_DECIMALS = 6;
// Mirror Pado's dust threshold (0.005 NUSDC). Below this, a Position NFT is
// a leftover from a partial sell-taker fill and renders as "0" — counting
// it would inflate the open-position count without representing real risk.
const DUST_THRESHOLD = BigInt(10 ** NUSDC_DECIMALS) / 200n;
const MAX_PAGES = 20;

interface ParsedPosition {
  shares: bigint;
  costBasis: bigint;
}

function parsePosition(obj: SuiObjectResponse): ParsedPosition {
  const content = obj.data?.content;
  const fields =
    content && "fields" in content ? (content.fields as Record<string, unknown>) : undefined;
  return {
    shares: BigInt((fields?.shares as string | number) ?? 0),
    costBasis: BigInt((fields?.cost_basis as string | number) ?? 0),
  };
}

async function fetchPositionsForAddress(
  client: SuiClient,
  address: string,
): Promise<{ count: number; totalCostBasis: bigint }> {
  let count = 0;
  let totalCostBasis = 0n;
  let cursor: string | null | undefined = undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await client.getOwnedObjects({
      owner: address,
      filter: { StructType: POSITION_TYPE },
      options: { showContent: true },
      cursor,
    });
    for (const obj of response.data) {
      const p = parsePosition(obj);
      if (p.shares < DUST_THRESHOLD) continue;
      count += 1;
      totalCostBasis += p.costBasis;
    }
    if (!response.hasNextPage || !response.nextCursor) break;
    cursor = response.nextCursor;
  }
  return { count, totalCostBasis };
}

export interface PadoPredictionSummary {
  count: number;
  totalCostBasis: bigint;
  isLoading: boolean;
}

export function usePadoPredictionSummary(): PadoPredictionSummary {
  const suiClient = useSuiClient();
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const walletReg = useUjuWalletRegistration();

  const signerAddress = isZkConnected
    ? zkState?.address
    : status === "unlocked"
      ? account?.address
      : undefined;

  // Stable, dedup'd, sorted address list. Sorted so the queryKey is order-
  // independent (registeredWallets order can shift between renders without
  // affecting the underlying set of wallets we're querying).
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
    queryKey: ["pado-prediction-summary", addressesKey],
    enabled: allAddresses.length > 0,
    // Dashboard summary only — no need to keep up with single-trade latency.
    // Pado's own pages (where the user manages positions) refetch faster.
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<{ count: number; totalCostBasis: bigint }> => {
      if (allAddresses.length === 0) return { count: 0, totalCostBasis: 0n };

      const results = await Promise.all(
        allAddresses.map((addr) => fetchPositionsForAddress(suiClient, addr)),
      );

      let count = 0;
      let totalCostBasis = 0n;
      for (const r of results) {
        count += r.count;
        totalCostBasis += r.totalCostBasis;
      }
      return { count, totalCostBasis };
    },
  });

  return {
    count: data?.count ?? 0,
    totalCostBasis: data?.totalCostBasis ?? 0n,
    isLoading,
  };
}
