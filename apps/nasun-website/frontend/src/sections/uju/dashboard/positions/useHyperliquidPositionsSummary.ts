// useHyperliquidPositionsSummary
//
// Fetches the signed-in user's Hyperliquid perp positions and spot balances
// in parallel from the public /info endpoint. No API key required — the
// EVM address from useValidEvmAddress is the user identifier.
//
// Aggregates the bits the dashboard card needs: open perp count, total
// notional in USD, summed unrealized PnL, account value, count of non-zero
// spot balances, and (2026-05-16 handoff) total spot holdings in USD via
// spotMetaAndAssetCtxs mid prices — this is the Capital row that lets the
// user compare Hyperliquid against Pado at a glance.
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
import { useValidEvmAddressForApp } from "./useValidEvmAddressForApp";

export interface HyperliquidPositionsSummary {
  isLoading: boolean;
  isAvailable: boolean;
  hasAny: boolean;
  perpCount: number;
  totalNotionalUsd: number;
  unrealizedPnlUsd: number;
  accountValueUsd: number;
  spotCount: number;
  // USD value of all non-zero spot balances, valued at mid prices from
  // spotMetaAndAssetCtxs. USDC contributes at $1; any token whose USDC pair
  // is not in the meta is skipped (treated as 0 USD) rather than guessed.
  spotHoldingsUsd: number;
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

interface SpotBalance {
  coin?: string;
  total?: string;
}

interface SpotClearinghouseStateResponse {
  balances?: SpotBalance[];
}

interface SpotMetaToken {
  name: string;
  index: number;
}

interface SpotMetaUniverse {
  name: string;
  tokens: [number, number];
}

interface SpotMetaResponse {
  tokens?: SpotMetaToken[];
  universe?: SpotMetaUniverse[];
}

interface SpotAssetCtx {
  midPx?: string;
  markPx?: string;
}

// `spotMetaAndAssetCtxs` returns a 2-tuple: [meta, ctxs[]] where ctxs is
// index-aligned with meta.universe.
type SpotMetaAndAssetCtxs = [SpotMetaResponse, SpotAssetCtx[]];

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

// Build a {tokenName -> midPriceUsd} map from spotMetaAndAssetCtxs.
// USDC implicitly maps to $1 since it is the quote in every pair the user
// can realistically hold balance in on HyperCore spot.
function buildMidPriceMap(
  meta: SpotMetaResponse,
  ctxs: SpotAssetCtx[],
): Map<string, number> {
  const map = new Map<string, number>();
  map.set("USDC", 1);
  const tokens = meta.tokens ?? [];
  const universe = meta.universe ?? [];
  for (let i = 0; i < universe.length; i++) {
    const entry = universe[i];
    const ctx = ctxs[i];
    if (!entry || !ctx) continue;
    const baseTok = tokens[entry.tokens[0]];
    const quoteTok = tokens[entry.tokens[1]];
    if (!baseTok || !quoteTok) continue;
    // Only USDC-quoted pairs are directly usable as a USD valuation source.
    // Other quote tokens (rare on HyperCore spot) would need a graph walk;
    // skip them for v1 — the affected balance just renders at 0 USD which
    // matches "we don't know what it's worth" better than guessing.
    if (quoteTok.name !== "USDC") continue;
    const mid = safeParseFloat(ctx.midPx) || safeParseFloat(ctx.markPx);
    if (mid > 0 && !map.has(baseTok.name)) {
      map.set(baseTok.name, mid);
    }
  }
  return map;
}

export function useHyperliquidPositionsSummary(): HyperliquidPositionsSummary {
  const owner = useValidEvmAddressForApp("hyperliquid");

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
          spotHoldingsUsd: 0,
        };
      }

      // allSettled so a single failing endpoint (rate-limit, transient
      // network) doesn't blank the whole card — the surviving half still
      // renders. Each side defaults to "no data" on failure.
      const [perpResult, spotResult, spotMetaResult] = await Promise.allSettled([
        postInfo<ClearinghouseStateResponse>({
          type: "clearinghouseState",
          user: owner,
        }),
        postInfo<SpotClearinghouseStateResponse>({
          type: "spotClearinghouseState",
          user: owner,
        }),
        postInfo<SpotMetaAndAssetCtxs>({ type: "spotMetaAndAssetCtxs" }),
      ]);

      const perp =
        perpResult.status === "fulfilled" ? perpResult.value : undefined;
      const spot =
        spotResult.status === "fulfilled" ? spotResult.value : undefined;
      const spotMetaPair =
        spotMetaResult.status === "fulfilled" ? spotMetaResult.value : undefined;

      const positions = perp?.assetPositions ?? [];
      const unrealizedPnlUsd = positions.reduce(
        (sum, p) => sum + safeParseFloat(p.position?.unrealizedPnl),
        0,
      );

      const balances = spot?.balances ?? [];
      const nonZeroBalances = balances.filter(
        (b) => safeParseFloat(b.total) > 0,
      );
      const spotCount = nonZeroBalances.length;

      let spotHoldingsUsd = 0;
      if (spotMetaPair) {
        const [meta, ctxs] = spotMetaPair;
        const midPrices = buildMidPriceMap(meta, ctxs);
        for (const b of nonZeroBalances) {
          const total = safeParseFloat(b.total);
          const price = b.coin ? (midPrices.get(b.coin) ?? 0) : 0;
          spotHoldingsUsd += total * price;
        }
      }

      // Treat as hard error only when the user-state endpoints both failed.
      // Mid-price meta failing on its own just drops the USD valuation to 0
      // and we still render the holding count.
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
        spotHoldingsUsd,
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
    spotHoldingsUsd: data?.spotHoldingsUsd ?? 0,
    error: query.isError
      ? query.error instanceof Error
        ? query.error.message
        : "Hyperliquid positions error"
      : null,
  };
}
