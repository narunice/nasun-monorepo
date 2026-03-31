/**
 * useEcosystemScore - Fetches ecosystem score data for a user.
 *
 * Extracted from EcosystemStatusCard's inline useEffect pattern
 * so ProfileHeroCard and other components can reuse it.
 */

import { useState, useEffect } from "react";
import {
  getEcosystemScore,
  type EcosystemScoreData,
} from "@/services/ecosystemScoreApi";

interface UseEcosystemScoreResult {
  score: EcosystemScoreData | null;
  isLoading: boolean;
}

export function useEcosystemScore(
  identityId: string | undefined,
): UseEcosystemScoreResult {
  const [score, setScore] = useState<EcosystemScoreData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!identityId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const data = await getEcosystemScore(identityId);
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
  }, [identityId]);

  return { score, isLoading };
}
