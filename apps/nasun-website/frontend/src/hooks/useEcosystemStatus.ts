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
  type EcosystemStatusResponse,
  type NftType,
} from "@/services/ecosystemApi";
import {
  syncEcosystemActivations,
  type EcosystemScoreData,
} from "@/services/ecosystemScoreApi";
import { queryClient as globalQueryClient } from "@/lib/queryClient";
import { ecosystemScoreKeys } from "@/hooks/useEcosystemScore";

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

  // Optimistically patch both caches so HealthGaugeCard/UjuNftShowcaseCard
  // flip to the new state immediately. The background sync+invalidate below
  // will overwrite these values with authoritative server data once
  // explorer-api has propagated the activation. Without this patch the user
  // has to reload — invalidate alone races the server cache propagation and
  // the refetch comes back stale.
  const applyOptimisticPatch = useCallback(
    (nftType: NftType, activated: boolean) => {
      // 1. Patch ecosystem status cache (drives getActivation()).
      localQueryClient.setQueryData<EcosystemStatusResponse>(
        ecosystemStatusKeys.all,
        (prev) => {
          if (!prev) return prev;
          const other = prev.activations.filter((a) => a.nftType !== nftType);
          if (!activated) return { ...prev, activations: other };
          const existing = prev.activations.find((a) => a.nftType === nftType);
          const next: Activation = {
            nftType,
            walletAddress: existing?.walletAddress ?? "",
            status: "ACTIVE",
            activatedAt: new Date().toISOString(),
            lastVerifiedAt: existing?.lastVerifiedAt,
            nftCount: existing?.nftCount ?? 1,
          };
          return { ...prev, activations: [...other, next] };
        },
      );

      // 2. Patch ecosystem score health slot (drives HealthGaugeCard donut).
      // Only alliance/genesis-pass have health slots in the score response.
      const slotKey =
        nftType === "alliance"
          ? "alliance"
          : nftType === "genesis-pass"
            ? "genesisPass"
            : null;
      const id = identityIdRef.current;
      if (slotKey && id) {
        localQueryClient.setQueryData<EcosystemScoreData>(
          ecosystemScoreKeys.detail(id),
          (prev) => {
            if (!prev?.health) return prev;
            return {
              ...prev,
              health: {
                ...prev.health,
                [slotKey]: activated
                  ? { hasNft: true, pct: 100, restDays: 0 }
                  : { hasNft: false, pct: 0, restDays: 0 },
              },
            };
          },
        );
      }
    },
    [localQueryClient],
  );

  const onMutationSuccess = useCallback(
    (nftType: NftType, activated: boolean) => {
      applyOptimisticPatch(nftType, activated);
      // Background reconciliation with the server. 500ms delay matches the
      // refresh() pattern in useEcosystemScore — gives explorer-api time to
      // propagate the activation change before we refetch /score.
      const id = identityIdRef.current;
      const invalidateAll = () => {
        localQueryClient.invalidateQueries({ queryKey: ecosystemStatusKeys.all });
        localQueryClient.invalidateQueries({ queryKey: ecosystemScoreKeys.all });
      };
      if (id) {
        syncEcosystemActivations(id)
          .catch(() => {})
          .finally(() => {
            setTimeout(invalidateAll, 500);
          });
      } else {
        invalidateAll();
      }
    },
    [applyOptimisticPatch, localQueryClient],
  );

  const activateMutation = useMutation({
    mutationFn: (nftType: NftType) => activateNft(tokenRef.current!, nftType),
    onSuccess: (_data, nftType) => onMutationSuccess(nftType, true),
  });

  const deactivateMutation = useMutation({
    mutationFn: (nftType: NftType) => deactivateNft(tokenRef.current!, nftType),
    onSuccess: (_data, nftType) => onMutationSuccess(nftType, false),
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
