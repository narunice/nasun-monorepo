import { useQuery } from "@tanstack/react-query";
import {
  fetchSuiTestnetValidators,
  fetchSuiTestnetStakes,
  fetchSuiTestnetBalance,
  type SuiValidator,
  type SuiStake,
} from "./suiTestnet";

export function useSuiTestnetValidators() {
  return useQuery<SuiValidator[]>({
    queryKey: ["sui-testnet", "validators"],
    queryFn: fetchSuiTestnetValidators,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useSuiTestnetStakes(address: string | undefined | null) {
  return useQuery<SuiStake[]>({
    queryKey: ["sui-testnet", "stakes", address ?? "anon"],
    queryFn: () => fetchSuiTestnetStakes(address!),
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useSuiTestnetBalance(address: string | undefined | null) {
  return useQuery<bigint>({
    queryKey: ["sui-testnet", "balance", address ?? "anon"],
    queryFn: () => fetchSuiTestnetBalance(address!),
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
