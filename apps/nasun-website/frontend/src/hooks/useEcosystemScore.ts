/**
 * useEcosystemScore - Fetches ecosystem score data for a user.
 *
 * Extracted from EcosystemStatusCard's inline useEffect pattern
 * so ProfileHeroCard and other components can reuse it.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getEcosystemScore,
  syncEcosystemActivations,
  type EcosystemScoreData,
} from "@/services/ecosystemScoreApi";

const RATE_LIMIT_COOLDOWN_MS = 20_000;

interface UseEcosystemScoreResult {
  score: EcosystemScoreData | null;
  isLoading: boolean;
  /** Sync activations cache then refetch score */
  refresh: () => void;
  isRefreshing: boolean;
  /** Seconds remaining until refresh is available again (0 = ready) */
  cooldownSeconds: number;
}

export function useEcosystemScore(
  identityId: string | undefined,
): UseEcosystemScoreResult {
  const [score, setScore] = useState<EcosystemScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval>>();

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

  // Cleanup timer on unmount
  useEffect(() => () => clearInterval(cooldownTimer.current), []);

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
    if (!identityId || isRefreshing || cooldownSeconds > 0) return;
    setIsRefreshing(true);
    (async () => {
      try {
        const syncResult = await syncEcosystemActivations(identityId);
        if (syncResult === null) {
          // Rate-limited by server
          startCooldown();
          return;
        }
        startCooldown();
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
  }, [identityId, isRefreshing, cooldownSeconds, fetchScore, startCooldown]);

  return { score, isLoading, refresh, isRefreshing, cooldownSeconds };
}
