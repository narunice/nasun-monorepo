// useHyperliquidPositionsSummary
//
// Fetches the signed-in user's Hyperliquid perp positions and spot balances
// in parallel from the public /info endpoint. No API key required — the
// EVM address from useValidEvmAddress is the user identifier.
//
// Aggregates the bits the dashboard card needs: open perp count, total
// notional in USD, summed unrealized PnL, account value, and the count of
// non-zero spot balances. Per-position detail is intentionally not surfaced
// here (v1 scope); follow-up PR can add a modal that re-fetches on demand.
//
// Rate-limit hygiene: 5-minute staleTime, 10-minute refetch interval, no
// window-focus refetch. Hyperliquid's per-IP limit is generous but a
// dashboard with many cards visible at once should not hammer it.
//
// Empty-response handling: an address that has never used Hyperliquid still
// returns a valid response with assetPositions=[] and balances=[]. Treated
// as "available, but nothing open" — the card consumer hides itself when
// both arrays are empty.

import { useQuery } from "@tanstack/react-query";

import { HYPERLIQUID_INFO_URL } from "./hyperliquidConfig";
import { useValidEvmAddress } from "./useValidEvmAddress";

export interface HyperliquidPositionsSummary {
  isLoading: boolean;
  isAvailable: boolean;
  hasAny: boolean;
  perpCount: number;
  totalNotionalUsd: number;
  unrealizedPnlUsd: number;
  accountValueUsd: number;
  spotCount: number;
  error: string | null;
}

interface ClearinghouseStateResponse {
  marginSummary?: {
    accountValue?: string;
    totalNtlPos?: string;
  };
  assetPositions?: Array<{
    position?: {
      unrealizedPnl?: string;
    };
  }>;
}

interface SpotClearinghouseStateResponse {
  balances?: Array<{
    total?: string;
  }>;
}

async function postInfo<T>(body: object): Promise<T> {
  const res = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Hyperliquid /info ${res.status}`);
  }
  return (await res.json()) as T;
}

function safeParseFloat(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function useHyperliquidPositionsSummary(): HyperliquidPositionsSummary {
  const owner = useValidEvmAddress();

  const query = useQuery({
    queryKey: ["hyperliquid-positions", owner],
    enabled: !!owner,
    staleTime: 300_000,
    refetchInterval: 600_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!owner) {
        return {
          perpCount: 0,
          totalNotionalUsd: 0,
          unrealizedPnlUsd: 0,
          accountValueUsd: 0,
          spotCount: 0,
        };
      }

      // allSettled so a single failing endpoint (rate-limit, transient
      // network) doesn't blank the whole card — the surviving half still
      // renders. Each side defaults to "no data" on failure.
      const [perpResult, spotResult] = await Promise.allSettled([
        postInfo<ClearinghouseStateResponse>({
          type: "clearinghouseState",
          user: owner,
        }),
        postInfo<SpotClearinghouseStateResponse>({
          type: "spotClearinghouseState",
          user: owner,
        }),
      ]);

      const perp =
        perpResult.status === "fulfilled" ? perpResult.value : undefined;
      const spot =
        spotResult.status === "fulfilled" ? spotResult.value : undefined;

      const positions = perp?.assetPositions ?? [];
      const unrealizedPnlUsd = positions.reduce(
        (sum, p) => sum + safeParseFloat(p.position?.unrealizedPnl),
        0,
      );

      const balances = spot?.balances ?? [];
      const spotCount = balances.filter(
        (b) => safeParseFloat(b.total) > 0,
      ).length;

      // Only treat as a hard error when both halves failed — partial
      // success still renders something useful.
      if (
        perpResult.status === "rejected" &&
        spotResult.status === "rejected"
      ) {
        throw perpResult.reason instanceof Error
          ? perpResult.reason
          : new Error("Hyperliquid /info both endpoints failed");
      }

      return {
        perpCount: positions.length,
        totalNotionalUsd: safeParseFloat(perp?.marginSummary?.totalNtlPos),
        unrealizedPnlUsd,
        accountValueUsd: safeParseFloat(perp?.marginSummary?.accountValue),
        spotCount,
      };
    },
  });

  const data = query.data;
  const perpCount = data?.perpCount ?? 0;
  const spotCount = data?.spotCount ?? 0;

  return {
    isLoading: query.isLoading,
    isAvailable: !!owner,
    hasAny: perpCount > 0 || spotCount > 0,
    perpCount,
    totalNotionalUsd: data?.totalNotionalUsd ?? 0,
    unrealizedPnlUsd: data?.unrealizedPnlUsd ?? 0,
    accountValueUsd: data?.accountValueUsd ?? 0,
    spotCount,
    error: query.isError
      ? query.error instanceof Error
        ? query.error.message
        : "Hyperliquid positions error"
      : null,
  };
}
