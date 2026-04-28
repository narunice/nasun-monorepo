// Read-only Sui mainnet hooks. File name is historical (used to read testnet);
// switched to mainnet for portfolio aggregator consistency. Public API names
// kept (useSuiTestnetValidators/Stakes/Balance) to avoid churning all callers
// in this fast-iteration patch — these now hit mainnet under the hood.
//
// queryKey changed from "sui-testnet" → "sui-mainnet" so any cached testnet
// data is invalidated cleanly on the switch (no mixed display).

import { useQuery } from "@tanstack/react-query";
import {
  fetchSuiValidators,
  fetchSuiStakes,
  fetchSuiBalance,
  type SuiValidator,
  type SuiStake,
} from "./suiTestnet";

export function useSuiTestnetValidators() {
  return useQuery<SuiValidator[]>({
    queryKey: ["sui-mainnet", "validators"],
    queryFn: fetchSuiValidators,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useSuiTestnetStakes(address: string | undefined | null) {
  return useQuery<SuiStake[]>({
    queryKey: ["sui-mainnet", "stakes", address ?? "anon"],
    queryFn: () => fetchSuiStakes(address!),
    enabled: !!address,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}

export function useSuiTestnetBalance(address: string | undefined | null) {
  return useQuery<bigint>({
    queryKey: ["sui-mainnet", "balance", address ?? "anon"],
    queryFn: () => fetchSuiBalance(address!),
    enabled: !!address,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}
