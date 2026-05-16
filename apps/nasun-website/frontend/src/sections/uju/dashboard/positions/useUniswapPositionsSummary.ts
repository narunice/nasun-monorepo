// useUniswapPositionsSummary
//
// Counts the signed-in user's open Uniswap V3 LP positions on Ethereum
// mainnet. Three-step read against the NonfungiblePositionManager:
//
//   1. balanceOf(owner)            -> number of LP NFTs the user holds
//   2. tokenOfOwnerByIndex(owner, i) for i in [0, balance) -> token ids
//   3. positions(tokenId) for each -> position struct including liquidity
//
// Steps 2 and 3 are issued via multicall3 (auto-batched by viem when the
// public client points at a chain with multicall deployed; mainnet has it).
// We then count entries with liquidity > 0 — closed positions retain the
// NFT but report zero liquidity, and we don't surface those here.
//
// Hard-capped at MAX_POSITIONS_PER_QUERY to keep latency predictable for
// outlier wallets with many positions.

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

import {
  MAX_POSITIONS_PER_QUERY,
  NPM_ABI,
  NPM_ADDRESS,
  UNISWAP_POSITIONS_CHAIN_ID,
} from "./uniswapConfig";
import { useValidEvmAddress } from "./useValidEvmAddress";

export interface UniswapPositionsSummary {
  isLoading: boolean;
  isAvailable: boolean;
  activeCount: number;
  totalCount: number;
  truncated: boolean;
  error: string | null;
}

export function useUniswapPositionsSummary(): UniswapPositionsSummary {
  const owner = useValidEvmAddress();
  const publicClient = usePublicClient({ chainId: UNISWAP_POSITIONS_CHAIN_ID });

  const query = useQuery({
    queryKey: ["uniswap-v3-positions", owner],
    enabled: !!owner && !!publicClient,
    staleTime: 300_000,
    refetchInterval: 900_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (!owner || !publicClient) {
        return { activeCount: 0, totalCount: 0, truncated: false };
      }

      const balance = await publicClient.readContract({
        address: NPM_ADDRESS,
        abi: NPM_ABI,
        functionName: "balanceOf",
        args: [owner],
      });
      const total = Number(balance);
      if (total === 0) {
        return { activeCount: 0, totalCount: 0, truncated: false };
      }

      const queryLimit = Math.min(total, MAX_POSITIONS_PER_QUERY);
      const truncated = total > queryLimit;

      // allowFailure: true so a single reverting tokenOfOwnerByIndex or
      // positions() read does not blank the whole card. Failed entries are
      // skipped from the active count.
      const tokenIdResults = await publicClient.multicall({
        allowFailure: true,
        contracts: Array.from({ length: queryLimit }, (_, i) => ({
          address: NPM_ADDRESS,
          abi: NPM_ABI,
          functionName: "tokenOfOwnerByIndex",
          args: [owner, BigInt(i)],
        })),
      });
      const tokenIds = tokenIdResults
        .filter((r): r is { status: "success"; result: bigint } => r.status === "success")
        .map((r) => r.result);

      if (tokenIds.length === 0) {
        return { activeCount: 0, totalCount: total, truncated };
      }

      const positionResults = await publicClient.multicall({
        allowFailure: true,
        contracts: tokenIds.map((id) => ({
          address: NPM_ADDRESS,
          abi: NPM_ABI,
          functionName: "positions",
          args: [id],
        })),
      });

      // positions() returns a 12-element tuple; liquidity is at index 7.
      let active = 0;
      for (const r of positionResults) {
        if (r.status !== "success") continue;
        const tuple = r.result as readonly unknown[];
        const liquidity = tuple[7] as bigint;
        if (liquidity > 0n) active += 1;
      }

      return { activeCount: active, totalCount: total, truncated };
    },
  });

  return {
    isLoading: query.isLoading,
    isAvailable: !!owner,
    activeCount: query.data?.activeCount ?? 0,
    totalCount: query.data?.totalCount ?? 0,
    truncated: query.data?.truncated ?? false,
    error: query.isError ? (query.error instanceof Error ? query.error.message : "Uniswap positions error") : null,
  };
}
