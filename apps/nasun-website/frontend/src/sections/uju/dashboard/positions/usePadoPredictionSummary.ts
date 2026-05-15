// usePadoPredictionSummary
//
// Lightweight cross-app read of the user's open Pado prediction-market
// positions. Returns just the two summary numbers the dashboard card needs
// (count + total cost basis in NUSDC) so we don't pull Pado's full Position
// rendering machinery into nasun-website. Talks to Sui RPC directly and only
// depends on @nasun/devnet-config + @nasun/wallet, both already available
// here.

import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { PREDICTION } from "@nasun/devnet-config";
import type { SuiObjectResponse } from "@mysten/sui/client";

const POSITION_TYPE = `${PREDICTION.packageId}::prediction_market::Position`;
const NUSDC_DECIMALS = 6;
// Mirror Pado's dust threshold (0.005 NUSDC). Below this, a Position NFT is
// a leftover from a partial sell-taker fill and renders as "0" — counting
// it would inflate the open-position count without representing real risk.
const DUST_THRESHOLD = BigInt(10 ** NUSDC_DECIMALS) / 200n;

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

export interface PadoPredictionSummary {
  count: number;
  totalCostBasis: bigint;
  isLoading: boolean;
}

export function usePadoPredictionSummary(): PadoPredictionSummary {
  const suiClient = useSuiClient();
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();

  const address = isZkConnected ? zkState?.address : status === "unlocked" ? account?.address : undefined;
  const isConnected = !!address;

  const { data, isLoading } = useQuery({
    queryKey: ["pado-prediction-summary", address],
    enabled: isConnected,
    // Dashboard summary only — no need to keep up with single-trade latency.
    // Pado's own pages (where the user manages positions) refetch faster.
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<{ count: number; totalCostBasis: bigint }> => {
      if (!address) return { count: 0, totalCostBasis: 0n };

      let count = 0;
      let totalCostBasis = 0n;
      let cursor: string | null | undefined = undefined;
      const MAX_PAGES = 20;

      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await suiClient.getOwnedObjects({
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
    },
  });

  return {
    count: data?.count ?? 0,
    totalCostBasis: data?.totalCostBasis ?? 0n,
    isLoading,
  };
}

// Format a NUSDC raw bigint (6 decimals) as a short USD-style string.
// Always 2 decimals so the dashboard number reads cleanly. Pado treats
// NUSDC as $1 throughout the UI; we follow that convention here.
export function formatNusdcAsUsd(amount: bigint): string {
  const divisor = BigInt(10 ** NUSDC_DECIMALS);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  // Round to cents.
  const cents = (remainder * 100n + divisor / 2n) / divisor;
  let displayWhole = whole;
  let displayCents = cents;
  if (cents >= 100n) {
    displayWhole += 1n;
    displayCents = 0n;
  }
  const centsStr = displayCents.toString().padStart(2, "0");
  // Add thousands separators for the integer portion.
  const wholeStr = displayWhole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${wholeStr}.${centsStr}`;
}
