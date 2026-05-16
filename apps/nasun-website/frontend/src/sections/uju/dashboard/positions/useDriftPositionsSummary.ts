// useDriftPositionsSummary
//
// Fetches the signed-in user's Drift trading snapshot from Drift's public
// Data API. No SDK, no key. The verified Solana address (base58) is the
// user identifier (Drift's "authority").
//
// Endpoint: GET /authority/{authority}/snapshots/overview?days=1
// Returns: products.trade[] each containing a snapshots[] array where the
// latest entry holds accountBalance / unrealizedPnl / cumulativeRealizedPnl.
// We sum across the user's trade subaccounts to produce the card's three
// rows (capital, unrealized PnL, lifetime realized PnL).
//
// Why /snapshots/overview and not per-position read: the public Data API
// does not expose live position state without signed auth headers. The
// snapshots endpoint is unauthenticated and trails by ~1 day, which is the
// right precision for a dashboard glance card. A live mark-to-market card
// would require @drift-labs/sdk (rejected on bundle grounds; see
// driftConfig.ts).
//
// Rate-limit hygiene: matches the Hyperliquid card (5-minute staleTime,
// 10-minute refetch interval, no window-focus refetch).
//
// Empty-response handling: an authority that has never used Drift returns
// `products.trade=[]`. We treat that as "available, but nothing to show"
// (hasAny=false lets the parent section hide the card).

import { useQuery } from "@tanstack/react-query";

import { isValidSolAddress } from "@/lib/solana";
import { DRIFT_DATA_API_URL } from "./driftConfig";
import { useValidSolanaAddressForApp } from "./useValidSolanaAddress";

export interface DriftPositionsSummary {
  isLoading: boolean;
  isAvailable: boolean;
  hasAny: boolean;
  // Sum of latest accountBalance across the user's trade subaccounts.
  accountBalanceUsd: number;
  // Sum of latest unrealizedPnl across the user's trade subaccounts.
  unrealizedPnlUsd: number;
  // Sum of latest cumulativeRealizedPnl (lifetime realized PnL).
  cumulativeRealizedPnlUsd: number;
  // Number of Drift subaccounts that have at least one snapshot.
  subAccountCount: number;
  error: string | null;
}

interface DriftSnapshot {
  ts?: number;
  accountBalance?: string;
  unrealizedPnl?: string;
  cumulativeRealizedPnl?: string;
}

interface DriftTradeAccount {
  accountId?: string;
  snapshots?: Array<DriftSnapshot | null>;
}

interface DriftOverviewResponse {
  success?: boolean;
  products?: {
    trade?: DriftTradeAccount[];
  };
}

function safeParseFloat(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function latestNonNullSnapshot(
  snapshots: Array<DriftSnapshot | null> | undefined,
): DriftSnapshot | null {
  if (!snapshots || snapshots.length === 0) return null;
  // The Data API documents snapshots[] as time-ordered but does not commit
  // to direction. Pick the entry with the largest `ts` rather than trust
  // array position; null entries are the API's way of indicating "no data
  // this bucket" and are skipped.
  let best: DriftSnapshot | null = null;
  let bestTs = -Infinity;
  for (const s of snapshots) {
    if (!s) continue;
    const ts = typeof s.ts === "number" ? s.ts : -Infinity;
    if (ts > bestTs) {
      best = s;
      bestTs = ts;
    }
  }
  return best;
}

export function useDriftPositionsSummary(): DriftPositionsSummary {
  const owner = useValidSolanaAddressForApp("drift");

  const query = useQuery({
    queryKey: ["drift-positions", owner],
    enabled: !!owner,
    staleTime: 300_000,
    refetchInterval: 600_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!owner) {
        return {
          accountBalanceUsd: 0,
          unrealizedPnlUsd: 0,
          cumulativeRealizedPnlUsd: 0,
          subAccountCount: 0,
        };
      }

      // days=1 is enough; we only need the latest non-null snapshot. A
      // narrower window keeps the response small and reduces tail-load on
      // Drift's CDN.
      //
      // Defence-in-depth: re-validate `owner` is a real base58 Solana
      // address before interpolating into the path. The selector
      // already gates on this but a defensive check costs nothing and
      // would block any future regression that loosened the gate.
      if (!isValidSolAddress(owner)) {
        throw new Error("Invalid Solana authority for Drift fetch");
      }
      const url = `${DRIFT_DATA_API_URL}/authority/${encodeURIComponent(owner)}/snapshots/overview?days=1`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Drift Data API ${res.status}`);
      }
      const data = (await res.json()) as DriftOverviewResponse;

      const accounts = data.products?.trade ?? [];
      let accountBalanceUsd = 0;
      let unrealizedPnlUsd = 0;
      let cumulativeRealizedPnlUsd = 0;
      let subAccountCount = 0;

      for (const account of accounts) {
        const snap = latestNonNullSnapshot(account.snapshots);
        if (!snap) continue;
        subAccountCount += 1;
        accountBalanceUsd += safeParseFloat(snap.accountBalance);
        unrealizedPnlUsd += safeParseFloat(snap.unrealizedPnl);
        cumulativeRealizedPnlUsd += safeParseFloat(snap.cumulativeRealizedPnl);
      }

      return {
        accountBalanceUsd,
        unrealizedPnlUsd,
        cumulativeRealizedPnlUsd,
        subAccountCount,
      };
    },
  });

  const data = query.data;
  const subAccountCount = data?.subAccountCount ?? 0;
  const accountBalanceUsd = data?.accountBalanceUsd ?? 0;

  return {
    isLoading: query.isLoading,
    isAvailable: !!owner,
    // Treat the card as "has activity" when the user has any tracked
    // subaccount with a non-zero balance OR a realized PnL history. A
    // brand-new authority returns trade=[] and we hide the card; an
    // authority that traded once and withdrew everything still has a
    // lifetime realized PnL worth showing.
    hasAny:
      subAccountCount > 0 &&
      (accountBalanceUsd !== 0 ||
        (data?.cumulativeRealizedPnlUsd ?? 0) !== 0 ||
        (data?.unrealizedPnlUsd ?? 0) !== 0),
    accountBalanceUsd,
    unrealizedPnlUsd: data?.unrealizedPnlUsd ?? 0,
    cumulativeRealizedPnlUsd: data?.cumulativeRealizedPnlUsd ?? 0,
    subAccountCount,
    error: query.isError
      ? query.error instanceof Error
        ? query.error.message
        : "Drift positions error"
      : null,
  };
}
