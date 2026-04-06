/**
 * useGenesisPassStatus Hook
 *
 * Checks Genesis Pass allowlist registration status.
 * - Primary: authenticated check by identity (when cognitoToken available)
 * - Fallback: public check by wallet address (when cognitoToken unavailable)
 *
 * Uses React Query for data fetching with global invalidation support.
 */

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { checkGenesisPass, getMyGenesisPassStatus, type GenesisPassStatus } from "@/services/genesisPassApi";
import { queryClient } from "@/lib/queryClient";

const API_CONFIGURED = !!import.meta.env.VITE_GENESIS_PASS_API;

export const genesisPassKeys = {
  all: ["genesis-pass", "status"] as const,
  detail: (mode: "auth" | "public") =>
    [...genesisPassKeys.all, { mode }] as const,
};

interface UseGenesisPassStatusReturn {
  isRegistered: boolean;
  isApplied: boolean;
  status: GenesisPassStatus;
  registeredWallet: string | null;
  registeredAt: string | null;
  mintType: string | null;
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;
  refetch: () => Promise<void>;
}

/**
 * Dispatch a global refetch so all hook instances re-query the API.
 */
export function invalidateGenesisPassStatus(): void {
  queryClient.invalidateQueries({ queryKey: genesisPassKeys.all });
}

export function useGenesisPassStatus(
  walletAddress: string | null | undefined,
  cognitoToken?: string | null,
): UseGenesisPassStatusReturn {
  const mode = cognitoToken ? "auth" : "public";

  const query = useQuery({
    queryKey: genesisPassKeys.detail(mode),
    queryFn: () =>
      cognitoToken
        ? getMyGenesisPassStatus(cognitoToken)
        : checkGenesisPass(walletAddress!),
    enabled: API_CONFIGURED && (!!walletAddress || !!cognitoToken),
    staleTime: 30_000,
    retry: 1,
  });

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  const data = query.data?.data;

  return {
    isRegistered: data?.registered ?? false,
    isApplied: data?.applied ?? false,
    status: (data?.status ?? null) as GenesisPassStatus,
    registeredWallet: data?.walletAddress ?? null,
    registeredAt: data?.registeredAt ?? null,
    mintType: data?.mintType ?? null,
    isLoading: query.isLoading || query.isFetching,
    error: query.error?.message ?? null,
    isConfigured: API_CONFIGURED,
    refetch,
  };
}
