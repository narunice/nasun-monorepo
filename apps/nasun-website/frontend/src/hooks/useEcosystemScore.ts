/**
 * useEcosystemScore - Fetches ecosystem score data for a user.
 *
 * Uses React Query for data fetching.
 * Cooldown timer for refresh rate-limiting is pure UI state (useState + useRef).
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getEcosystemScore,
  syncEcosystemActivations,
  syncEcosystemTodayActivity,
  type EcosystemScoreData,
} from "@/services/ecosystemScoreApi";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/features/auth";

const RATE_LIMIT_COOLDOWN_MS = 30_000;

export const ecosystemScoreKeys = {
  all: ["ecosystem", "score"] as const,
  detail: (identityId: string | undefined) =>
    [...ecosystemScoreKeys.all, identityId] as const,
};

interface UseEcosystemScoreResult {
  score: EcosystemScoreData | null;
  isLoading: boolean;
  isError: boolean;
  /** Sync activations cache then refetch score */
  refresh: () => void;
  isRefreshing: boolean;
  /** Seconds remaining until refresh is available again (0 = ready) */
  cooldownSeconds: number;
}

export function useEcosystemScore(
  identityId: string | undefined,
): UseEcosystemScoreResult {
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;
  // Cooldown timer (pure UI state)
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Cleanup timer on unmount
  useEffect(() => () => clearInterval(cooldownTimer.current), []);

  const startCooldown = useCallback(() => {
    setCooldownSeconds(Math.ceil(RATE_LIMIT_COOLDOWN_MS / 1000));
    clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const query = useQuery({
    queryKey: ecosystemScoreKeys.detail(identityId),
    queryFn: () => getEcosystemScore(identityId!),
    enabled: !!identityId,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Use refs to avoid stale closure in refresh
  const identityIdRef = useRef(identityId);
  identityIdRef.current = identityId;
  const tokenRef = useRef(cognitoToken);
  tokenRef.current = cognitoToken;

  const refresh = useCallback(() => {
    const id = identityIdRef.current;
    if (!id || isRefreshing || cooldownSeconds > 0) return;

    setIsRefreshing(true);
    (async () => {
      try {
        // Run NFT activations sync (legacy) + today-window activity sync
        // (catches events the live scanner skipped due to wallet cache miss)
        // in parallel. Both are rate-limited server-side; either may return
        // null without aborting the refetch.
        const token = tokenRef.current;
        const [activationsResult] = await Promise.all([
          syncEcosystemActivations(id),
          token ? syncEcosystemTodayActivity(token) : Promise.resolve(null),
        ]);
        if (activationsResult === null) {
          // Rate-limited by server (activations endpoint)
          startCooldown();
          return;
        }
        startCooldown();
        // Brief delay for cache propagation before refetch
        await new Promise((r) => setTimeout(r, 500));
        await queryClient.invalidateQueries({ queryKey: ecosystemScoreKeys.detail(id) });
        // Notify other components (DailyMissions, etc.) to refresh
        window.dispatchEvent(new Event("ecosystem:refresh"));
      } catch (err) {
        console.error("[useEcosystemScore] refresh error:", err);
      } finally {
        setIsRefreshing(false);
      }
    })();
  }, [isRefreshing, cooldownSeconds, startCooldown]);

  return {
    score: query.data ?? null,
    isLoading: query.isLoading || query.isFetching,
    isError: query.isError,
    refresh,
    isRefreshing,
    cooldownSeconds,
  };
}
