import { useQuery } from "@tanstack/react-query";
import {
  getEcosystemLeaderboardFull,
  getAvailableEcosystemWeeks,
  type EcosystemLeaderboardResponse,
  type AvailableEcosystemWeek,
} from "@/services/ecosystemScoreApi";

const API_BASE = import.meta.env.VITE_EXPLORER_API_URL;

export function useEcosystemLeaderboard(weekId: string | undefined, enabled = true) {
  return useQuery<EcosystemLeaderboardResponse>({
    queryKey: ["ecosystem-leaderboard", weekId ?? "current"],
    queryFn: () => getEcosystemLeaderboardFull(weekId),
    enabled: !!API_BASE && enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });
}

export function useAvailableEcosystemWeeks() {
  return useQuery<AvailableEcosystemWeek[]>({
    queryKey: ["ecosystem-leaderboard", "weeks"],
    queryFn: getAvailableEcosystemWeeks,
    enabled: !!API_BASE,
    staleTime: 2 * 60_000,
  });
}
