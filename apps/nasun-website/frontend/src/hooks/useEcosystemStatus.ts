/**
 * useEcosystemStatus Hook
 *
 * Fetches NFT activation status for the current user.
 * Provides activate/deactivate actions via useMutation.
 * Uses React Query for data fetching with global invalidation support.
 */

import { useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getEcosystemStatus,
  activateNft,
  deactivateNft,
  isEcosystemApiConfigured,
  type Activation,
  type NftType,
} from "@/services/ecosystemApi";
import { syncEcosystemActivations } from "@/services/ecosystemScoreApi";
import { queryClient as globalQueryClient } from "@/lib/queryClient";

const EMPTY_ACTIVATIONS: Activation[] = [];

export const ecosystemStatusKeys = {
  all: ["ecosystem", "status"] as const,
};

export function invalidateEcosystemStatus() {
  globalQueryClient.invalidateQueries({ queryKey: ecosystemStatusKeys.all });
}

interface UseEcosystemStatusResult {
  activations: Activation[];
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;
  getActivation: (nftType: NftType) => Activation | undefined;
  activate: (nftType: NftType) => Promise<void>;
  deactivate: (nftType: NftType) => Promise<void>;
  isActivating: boolean;
  activateError: string | null;
}

export function useEcosystemStatus(
  cognitoToken: string | undefined,
  identityId?: string,
): UseEcosystemStatusResult {
  const localQueryClient = useQueryClient();
  const isConfigured = isEcosystemApiConfigured();

  // Stable refs for mutation callbacks
  const tokenRef = useRef(cognitoToken);
  tokenRef.current = cognitoToken;
  const identityIdRef = useRef(identityId);
  identityIdRef.current = identityId;

  const query = useQuery({
    queryKey: ecosystemStatusKeys.all,
    queryFn: () => getEcosystemStatus(cognitoToken!),
    enabled: isConfigured && !!cognitoToken,
    staleTime: 30_000,
    retry: 1,
  });

  const activations = query.data?.activations ?? EMPTY_ACTIVATIONS;

  const getActivation = useCallback(
    (nftType: NftType) =>
      activations.find((a) => a.nftType === nftType && a.status === "ACTIVE"),
    [activations],
  );

  const onMutationSuccess = useCallback(() => {
    localQueryClient.invalidateQueries({ queryKey: ecosystemStatusKeys.all });
    // Fire-and-forget sync (only when identityId is provided)
    const id = identityIdRef.current;
    if (id) syncEcosystemActivations(id).catch(() => {});
  }, [localQueryClient]);

  const activateMutation = useMutation({
    mutationFn: (nftType: NftType) => activateNft(tokenRef.current!, nftType),
    onSuccess: onMutationSuccess,
  });

  const deactivateMutation = useMutation({
    mutationFn: (nftType: NftType) => deactivateNft(tokenRef.current!, nftType),
    onSuccess: onMutationSuccess,
  });

  const activate = useCallback(
    async (nftType: NftType) => {
      await activateMutation.mutateAsync(nftType);
    },
    [activateMutation.mutateAsync],
  );

  const deactivate = useCallback(
    async (nftType: NftType) => {
      await deactivateMutation.mutateAsync(nftType);
    },
    [deactivateMutation.mutateAsync],
  );

  return {
    activations,
    isLoading: query.isLoading || query.isFetching,
    error: query.error?.message ?? null,
    isConfigured,
    getActivation,
    activate,
    deactivate,
    isActivating: activateMutation.isPending || deactivateMutation.isPending,
    activateError:
      activateMutation.error?.message ??
      deactivateMutation.error?.message ??
      null,
  };
}
