/**
 * useCreatorsAppreciationBonus Hook
 *
 * Status query + claim mutation for the Creators Appreciation Bonus.
 * Returns a `claim` fn that resolves to a boolean: true when the claim
 * API call succeeded (or was already applied — both are idempotent
 * success), false when it failed so the caller can suppress success UI.
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCreatorsAppreciationStatus,
  claimCreatorsAppreciationBonus,
  type CreatorsAppreciationStatus,
} from "@/services/creatorsAppreciationApi";
import { ecosystemScoreKeys } from "@/hooks/useEcosystemScore";

const keys = {
  status: (token: string | undefined) =>
    ["creators-appreciation", "status", token ?? "anon"] as const,
};

interface UseCreatorsAppreciationBonusResult {
  status: CreatorsAppreciationStatus | undefined;
  isLoading: boolean;
  isError: boolean;
  isClaiming: boolean;
  error: string | null;
  /** Returns true on success, false when the request failed. */
  claim: () => Promise<boolean>;
  refetch: () => Promise<unknown>;
}

export function useCreatorsAppreciationBonus(
  cognitoToken: string | undefined,
): UseCreatorsAppreciationBonusResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: keys.status(cognitoToken),
    queryFn: () => getCreatorsAppreciationStatus(cognitoToken!),
    enabled: !!cognitoToken,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: () => claimCreatorsAppreciationBonus(cognitoToken!),
    onSuccess: (result) => {
      // 1. Optimistically flip status.claimed so the card collapses
      //    immediately, before any network round-trip.
      queryClient.setQueryData<CreatorsAppreciationStatus>(
        keys.status(cognitoToken),
        (prev) =>
          prev
            ? {
                ...prev,
                claimed: true,
                claimedAt: new Date().toISOString(),
                bonusPoints: result.bonusPoints,
              }
            : prev,
      );

      // 2. Force an immediate refetch of ecosystem score so "All Time"
      //    reflects +60 without the user reloading. We refetch rather than
      //    just invalidate so react-query doesn't keep the stale value
      //    visible while revalidating in the background. A short delay
      //    lets the INSERT settle in Postgres before the read.
      //    (Mirrors the 500ms delay used by useEcosystemScore.refresh.)
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ecosystemScoreKeys.all });
        // Authoritative re-read of claim status (also confirms claimedAt).
        queryClient.refetchQueries({ queryKey: keys.status(cognitoToken) });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("ecosystem:refresh"));
        }
      }, 500);
    },
  });

  // `mutateAsync` is a stable reference from react-query, so depending on
  // it (rather than the whole `mutation` object, which is a new reference
  // each render) keeps `claim` referentially stable.
  const mutateAsync = mutation.mutateAsync;
  const claim = useCallback(async (): Promise<boolean> => {
    if (!cognitoToken) return false;
    try {
      await mutateAsync();
      return true;
    } catch {
      return false;
    }
  }, [cognitoToken, mutateAsync]);

  return {
    status: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    isClaiming: mutation.isPending,
    error: query.error?.message ?? mutation.error?.message ?? null,
    claim,
    refetch: query.refetch,
  };
}
