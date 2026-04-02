/**
 * useEcosystemStatus Hook
 *
 * Fetches NFT activation status for the current user.
 * Provides activate/deactivate actions.
 */

import { useState, useEffect, useCallback } from "react";
import {
  getEcosystemStatus,
  activateNft,
  deactivateNft,
  isEcosystemApiConfigured,
  type Activation,
  type NftType,
  type EcosystemApiError,
} from "@/services/ecosystemApi";
import { syncEcosystemActivations } from "@/services/ecosystemScoreApi";

const INVALIDATE_EVENT = "ecosystem:invalidate";

export function invalidateEcosystemStatus() {
  window.dispatchEvent(new Event(INVALIDATE_EVENT));
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
  const [activations, setActivations] = useState<Activation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const isConfigured = isEcosystemApiConfigured();

  const fetchStatus = useCallback(async () => {
    if (!cognitoToken || !isConfigured) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await getEcosystemStatus(cognitoToken);
      setActivations(res.activations);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [cognitoToken, isConfigured]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Listen for invalidation events
  useEffect(() => {
    const handler = () => fetchStatus();
    window.addEventListener(INVALIDATE_EVENT, handler);
    return () => window.removeEventListener(INVALIDATE_EVENT, handler);
  }, [fetchStatus]);

  const getActivation = useCallback(
    (nftType: NftType) => activations.find((a) => a.nftType === nftType && a.status === "ACTIVE"),
    [activations],
  );

  const activate = useCallback(
    async (nftType: NftType) => {
      if (!cognitoToken) return;
      setIsActivating(true);
      setActivateError(null);
      try {
        await activateNft(cognitoToken, nftType);
        await fetchStatus();
        // Sync explorer-api activation cache (fire-and-forget)
        if (identityId) syncEcosystemActivations(identityId).catch(() => {});
        invalidateEcosystemStatus();
      } catch (err) {
        const msg = (err as EcosystemApiError).message || "Activation failed";
        setActivateError(msg);
        throw err;
      } finally {
        setIsActivating(false);
      }
    },
    [cognitoToken, fetchStatus],
  );

  const deactivate = useCallback(
    async (nftType: NftType) => {
      if (!cognitoToken) return;
      setIsActivating(true);
      setActivateError(null);
      try {
        await deactivateNft(cognitoToken, nftType);
        await fetchStatus();
        if (identityId) syncEcosystemActivations(identityId).catch(() => {});
        invalidateEcosystemStatus();
      } catch (err) {
        const msg = (err as EcosystemApiError).message || "Deactivation failed";
        setActivateError(msg);
        throw err;
      } finally {
        setIsActivating(false);
      }
    },
    [cognitoToken, fetchStatus],
  );

  return {
    activations,
    isLoading,
    error,
    isConfigured,
    getActivation,
    activate,
    deactivate,
    isActivating,
    activateError,
  };
}
