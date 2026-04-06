/**
 * useAllianceMintStatus Hook
 *
 * Checks Alliance NFT mint status and provides registered wallet list.
 * Uses React Query for data fetching with global invalidation support.
 */

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAllianceStatus, isAllianceApiConfigured, type AllianceWallet } from "@/services/allianceNftApi";
import { queryClient } from "@/lib/queryClient";

const API_CONFIGURED = isAllianceApiConfigured();

const EMPTY_WALLETS: AllianceWallet[] = [];

interface AllianceMintData {
  imageIndex: number;
  walletAddress: string;
  txDigest: string;
  nftObjectId: string;
  mintedAt: string;
}

export const allianceMintKeys = {
  all: ["alliance", "mint-status"] as const,
};

interface UseAllianceMintStatusReturn {
  isMinted: boolean;
  isLoading: boolean;
  data: AllianceMintData | null;
  wallets: AllianceWallet[];
  error: string | null;
  isConfigured: boolean;
  refetch: () => Promise<void>;
}

export function invalidateAllianceMintStatus(): void {
  queryClient.invalidateQueries({ queryKey: allianceMintKeys.all });
}

export function useAllianceMintStatus(
  cognitoToken?: string | null,
): UseAllianceMintStatusReturn {
  const query = useQuery({
    queryKey: allianceMintKeys.all,
    queryFn: () => getAllianceStatus(cognitoToken!),
    enabled: API_CONFIGURED && !!cognitoToken,
    staleTime: 30_000,
    retry: 1,
  });

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  return {
    isMinted: query.data?.minted ?? false,
    isLoading: query.isLoading || query.isFetching,
    data: (query.data?.data as AllianceMintData) ?? null,
    wallets: query.data?.wallets ?? EMPTY_WALLETS,
    error: query.error?.message ?? null,
    isConfigured: API_CONFIGURED,
    refetch,
  };
}
