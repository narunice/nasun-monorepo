/**
 * useEcosystemScore - Fetches ecosystem score data for a user.
 *
 * Extracted from EcosystemStatusCard's inline useEffect pattern
 * so ProfileHeroCard and other components can reuse it.
 */

import { useState, useEffect, useCallback } from "react";
import {
  getEcosystemScore,
  syncEcosystemActivations,
  type EcosystemScoreData,
} from "@/services/ecosystemScoreApi";

interface UseEcosystemScoreResult {
  score: EcosystemScoreData | null;
  isLoading: boolean;
  /** Sync activations cache then refetch score */
  refresh: () => void;
  isRefreshing: boolean;
}

export function useEcosystemScore(
  identityId: string | undefined,
): UseEcosystemScoreResult {
  const [score, setScore] = useState<EcosystemScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchScore = useCallback(async (id: string) => {
    const data = await getEcosystemScore(id);
    return data;
  }, []);

  useEffect(() => {
    if (!identityId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const data = await fetchScore(identityId);
        if (!cancelled) setScore(data);
      } catch (err) {
        console.error("[useEcosystemScore]", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identityId, fetchScore]);

  const refresh = useCallback(() => {
    if (!identityId || isRefreshing) return;
    setIsRefreshing(true);
    (async () => {
      try {
        await syncEcosystemActivations(identityId);
        // Brief delay for cache propagation before refetch
        await new Promise((r) => setTimeout(r, 500));
        const data = await fetchScore(identityId);
        if (data) setScore(data);
        // Notify other components (DailyMissions, etc.) to refresh
        window.dispatchEvent(new Event("ecosystem:refresh"));
      } catch (err) {
        console.error("[useEcosystemScore] refresh error:", err);
      } finally {
        setIsRefreshing(false);
      }
    })();
  }, [identityId, isRefreshing, fetchScore]);

  return { score, isLoading, refresh, isRefreshing };
}
