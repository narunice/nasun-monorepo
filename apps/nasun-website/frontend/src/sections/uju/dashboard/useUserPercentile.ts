import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";

const API_BASE = import.meta.env.VITE_EXPLORER_API_URL;

interface AllTimePercentileResponse {
  data: {
    rank: number | null;
    total: number | null;
    percentile: number | null;
    myTotal: number;
  };
}

/**
 * All-time ecosystem points percentile — "where do I stand against every
 * Nasun user, ever?" Hits explorer-api's
 * `/leaderboard/all-time-percentile/:identityId`, which ranks users by
 * snapshot-base*multiplier + bonuses + governance + scaled-referral.
 *
 * Returns `percentile = null` only when the user has 0 all-time points or
 * the API is unavailable. The previous weekly-leaderboard implementation
 * silently returned null for any user without weekly activity, which is
 * why this number kept disappearing for many real accounts.
 */
export function useUserPercentile(identityId: string | undefined): {
  percentile: number | null;
  rank: number | null;
  total: number | null;
  isLoading: boolean;
} {
  // Self-only endpoint — pull the caller's Cognito token so the server can
  // verify the request is for the authenticated identity. Without a token
  // we skip the query (server would 401 anyway).
  const { user } = useAuth();
  const token = user?.cognitoToken;
  const { data, isLoading } = useQuery<AllTimePercentileResponse>({
    queryKey: ["ecosystem-all-time-percentile", identityId],
    queryFn: async () => {
      const res = await fetch(
        `${API_BASE}/ecosystem/leaderboard/all-time-percentile/${encodeURIComponent(identityId!)}`,
        { headers: { Authorization: `Bearer ${token!}` } },
      );
      if (!res.ok) throw new Error(`percentile fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!API_BASE && !!identityId && !!token,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    percentile: data?.data.percentile ?? null,
    rank: data?.data.rank ?? null,
    total: data?.data.total ?? null,
    isLoading,
  };
}
