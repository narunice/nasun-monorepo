// useAavePositionsSummary
//
// Reads Aave v3 supply/borrow exposure for the signed-in user across the
// five primary EVM deployments (Ethereum mainnet, Arbitrum, Base, Polygon,
// Optimism). Each chain is queried independently via wagmi's readContract
// and Promise.allSettled — a single-chain RPC failure should degrade
// gracefully, the card only hard-errors when every chain fails.
//
// Aave Pool.getUserAccountData returns base units in USD with 8 decimals
// (1e8) for collateral/debt and 18 decimals (1e18) for the health factor.
// When the user has no debt on a chain, Aave returns
// type(uint256).max for the health factor; we skip those entries instead
// of trying to coerce to Number.

import { useQuery } from "@tanstack/react-query";
import { useConfig } from "wagmi";
import { readContract } from "wagmi/actions";
import { formatUnits } from "viem";

import { AAVE_POOLS, AAVE_POOL_ABI } from "./aaveConfig";
import { useValidEvmAddressForApp } from "./useValidEvmAddressForApp";

export interface AavePositionsSummary {
  isLoading: boolean;
  isAvailable: boolean;
  hasAny: boolean;
  totalSuppliedUsd: number;
  totalBorrowedUsd: number;
  minHealthFactor: number | null;
  activeChains: { chainId: number; chainLabel: string }[];
  error: string | null;
}

interface QueryResult {
  totalSuppliedUsd: number;
  totalBorrowedUsd: number;
  minHealthFactor: number | null;
  activeChains: { chainId: number; chainLabel: string }[];
}

export function useAavePositionsSummary(): AavePositionsSummary {
  const owner = useValidEvmAddressForApp("aave");
  const wagmiConfig = useConfig();

  const query = useQuery<QueryResult>({
    queryKey: ["aave-v3-positions", owner],
    enabled: !!owner,
    staleTime: 300_000,
    refetchInterval: 600_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!owner) {
        return {
          totalSuppliedUsd: 0,
          totalBorrowedUsd: 0,
          minHealthFactor: null,
          activeChains: [],
        };
      }

      const results = await Promise.allSettled(
        AAVE_POOLS.map((pool) =>
          readContract(wagmiConfig, {
            chainId: pool.chainId,
            address: pool.address,
            abi: AAVE_POOL_ABI,
            functionName: "getUserAccountData",
            args: [owner],
          }),
        ),
      );

      const allFailed = results.every((r) => r.status === "rejected");
      if (allFailed) {
        throw new Error("Aave: all chain queries failed");
      }

      let totalSuppliedUsd = 0;
      let totalBorrowedUsd = 0;
      let minHealthFactor: number | null = null;
      const activeChains: { chainId: number; chainLabel: string }[] = [];

      results.forEach((r, i) => {
        if (r.status !== "fulfilled") return;
        const tuple = r.value as readonly bigint[];
        const collateralBase = tuple[0];
        const debtBase = tuple[1];
        const healthFactorRaw = tuple[5];

        // Base USD units use 8 decimals on Aave v3.
        const supplied = Number(formatUnits(collateralBase, 8));
        const borrowed = Number(formatUnits(debtBase, 8));
        totalSuppliedUsd += supplied;
        totalBorrowedUsd += borrowed;

        if (supplied > 0 || borrowed > 0) {
          activeChains.push({
            chainId: AAVE_POOLS[i].chainId,
            chainLabel: AAVE_POOLS[i].chainLabel,
          });
        }

        // Health factor is meaningful only when the user has debt. With
        // zero debt Aave returns type(uint256).max — skip it instead of
        // forcing a Number conversion that would overflow to Infinity.
        if (borrowed > 0) {
          const hf = Number(formatUnits(healthFactorRaw, 18));
          if (Number.isFinite(hf)) {
            if (minHealthFactor === null || hf < minHealthFactor) {
              minHealthFactor = hf;
            }
          }
        }
      });

      return {
        totalSuppliedUsd,
        totalBorrowedUsd,
        minHealthFactor,
        activeChains,
      };
    },
  });

  const data = query.data;
  const totalSuppliedUsd = data?.totalSuppliedUsd ?? 0;
  const totalBorrowedUsd = data?.totalBorrowedUsd ?? 0;

  return {
    isLoading: query.isLoading,
    isAvailable: !!owner,
    hasAny: totalSuppliedUsd > 0 || totalBorrowedUsd > 0,
    totalSuppliedUsd,
    totalBorrowedUsd,
    minHealthFactor: data?.minHealthFactor ?? null,
    activeChains: data?.activeChains ?? [],
    error: query.isError
      ? query.error instanceof Error
        ? query.error.message
        : "Aave positions error"
      : null,
  };
}
