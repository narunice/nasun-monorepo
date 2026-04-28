// SOL liquid staking token (LST) balance query (Mainnet, read-only).
//
// Plan v5 Phase 3C: only mSOL / jitoSOL / bSOL. Native stake account scan
// (getProgramAccounts) is intentionally skipped — public RPCs frequently
// disable it and we route native stakers to https://stakeview.app instead.
//
// PublicNode policy: getTokenAccountsByOwner with `programId` filter is BLOCKED
// (too expensive for public tier), but per-mint filter is allowed. So we issue
// one call per LST mint (3 total). Each is cheap and the calls are batched
// concurrently via Promise.all under a single react-query staleTime.

import { useQuery } from "@tanstack/react-query";
import { solReadCall } from "@/lib/solana-readonly";

export const SOL_LSTS = [
  { symbol: "mSOL",    mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So" },
  { symbol: "jitoSOL", mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn" },
  { symbol: "bSOL",    mint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1" },
] as const;

export type SolLstSymbol = (typeof SOL_LSTS)[number]["symbol"];

export interface SolLstBalance {
  symbol: SolLstSymbol;
  uiAmount: number;
}

interface ParsedTokenAccountsResponse {
  value: Array<{
    account: {
      data: {
        parsed: {
          info: {
            mint: string;
            tokenAmount: { uiAmount: number | null };
          };
        };
      };
    };
  }>;
}

async function fetchLstBalance(
  owner: string,
  mint: string,
): Promise<number> {
  const res = await solReadCall<ParsedTokenAccountsResponse>(
    "getTokenAccountsByOwner",
    [
      owner,
      { mint },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ],
  );
  // Aggregate across multiple accounts for the same mint (rare but possible).
  let total = 0;
  for (const acc of res.value) {
    const ui = acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
    if (typeof ui === "number") total += ui;
  }
  return total;
}

export function useSolLst(solAddress: string | null) {
  return useQuery<SolLstBalance[]>({
    queryKey: ["sol-lst", "mainnet", solAddress],
    enabled: !!solAddress,
    queryFn: async () => {
      const owner = solAddress!;
      // Sequential, not Promise.all: Solana Foundation public RPC rate-limits
      // identical-method bursts ("Too many requests for a specific RPC call")
      // from a single IP. 3 sequential calls (~200ms each) total ~600ms,
      // acceptable for read-only display. Promise.all observed to trigger 429.
      const out: SolLstBalance[] = [];
      for (const lst of SOL_LSTS) {
        out.push({
          symbol: lst.symbol as SolLstSymbol,
          uiAmount: await fetchLstBalance(owner, lst.mint),
        });
      }
      return out;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    retry: 2,
    retryDelay: (i) => Math.min(1000 * 2 ** i, 30_000),
  });
}
