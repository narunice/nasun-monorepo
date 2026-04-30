import { FC, useState } from "react";
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useWallet } from "@nasun/wallet";
import {
  useAvailableWeeks,
  type ScoreLeaderboardResponse,
} from "@/features/pado-score-leaderboard/usePadoScoreLeaderboard";
import { Spinner } from "@/components/ui";
import { UjuCard, UjuSectionHeader } from "../../shared";

const HISTORY_WEEKS_LIMIT = 8;

function getChatHttpUrl(): string {
  return import.meta.env.VITE_NASUN_CHAT_HTTP_URL || "";
}

async function fetchWeeklyPadoLeaderboard(
  weekId: string,
): Promise<ScoreLeaderboardResponse> {
  const baseUrl = getChatHttpUrl();
  if (!baseUrl) {
    return { scope: "weekly", weekId, traders: [], updatedAt: 0, totalTraders: 0, totalParticipants: 0 };
  }
  const params = new URLSearchParams({ limit: "2000", offset: "0" });
  const res = await fetch(
    `${baseUrl}/api/pado/leaderboard/score/weekly/${weekId}?${params}`,
  );
  if (res.status === 404) {
    return { scope: "weekly", weekId, traders: [], updatedAt: 0, totalTraders: 0, totalParticipants: 0 };
  }
  if (!res.ok) throw new Error(`Pado leaderboard ${res.status}`);
  return res.json();
}

interface Props {
  className?: string;
}

export const UjuDefiLeaderboardHistoryCard: FC<Props> = ({
  className = "",
}) => {
  const { account } = useWallet();
  const walletAddress = account?.address?.toLowerCase();
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: weeksResp } = useAvailableWeeks();
  const weeks = weeksResp?.weeks ?? [];
  const recentWeeks = weeks.slice(0, HISTORY_WEEKS_LIMIT);

  // Always fetch the current (latest) week so we can show realtime rank.
  const currentWeekQuery = useQuery({
    queryKey: ["uju", "defi-history", "week", recentWeeks[0]?.weekId ?? ""],
    queryFn: () => fetchWeeklyPadoLeaderboard(recentWeeks[0]!.weekId),
    enabled: !!walletAddress && recentWeeks.length > 0,
    staleTime: 30_000,
  });

  // Past weeks loaded only when expanded.
  const pastWeeks = recentWeeks.slice(1);
  const pastQueries = useQueries({
    queries: pastWeeks.map((w) => ({
      queryKey: ["uju", "defi-history", "week", w.weekId],
      queryFn: () => fetchWeeklyPadoLeaderboard(w.weekId),
      enabled: !!walletAddress && isExpanded,
      staleTime: 5 * 60_000,
    })),
  });

  function findRank(data: ScoreLeaderboardResponse | undefined) {
    if (!data || !walletAddress) return null;
    const t = data.traders.find((x) => x.address.toLowerCase() === walletAddress);
    return t?.rank ?? null;
  }

  const currentRank = findRank(currentWeekQuery.data);
  const previousRank = pastQueries[0]?.data ? findRank(pastQueries[0].data) : null;

  let trend: "up" | "down" | "flat" | null = null;
  if (currentRank != null && previousRank != null) {
    if (currentRank < previousRank) trend = "up";
    else if (currentRank > previousRank) trend = "down";
    else trend = "flat";
  }

  const headerTrailing = (
    <button
      onClick={() => setIsExpanded((p) => !p)}
      className="text-uju-secondary hover:text-uju-primary transition-colors text-sm font-semibold uppercase tracking-widest flex items-center gap-2"
    >
      {isExpanded ? "Collapse" : "Expand History"}
      <svg
        className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  return (
    <UjuCard className={`animate-fade-slide-up ${className}`}>
      <UjuSectionHeader
        accent
        title="DeFi Leaderboard History"
        subtitle="Weekly rank on the Pado trading leaderboard"
        trailing={headerTrailing}
      />

      {!walletAddress ? (
        <div className="flex flex-col items-center py-8 bg-uju-bg/30 rounded-xl border border-uju-border/10">
          <p className="text-uju-secondary font-light text-center px-6">
            Connect a wallet to view your Pado rank history.
          </p>
        </div>
      ) : (
        <div className="space-y-4 mt-2">
          <div className="flex items-center justify-between p-4 bg-uju-bg/40 rounded-xl border border-uju-border/15">
            <div>
              <p className="text-sm font-semibold text-uju-secondary uppercase tracking-widest">
                Current Week
              </p>
              <p className="text-sm font-light text-uju-secondary/80 mt-0.5">
                {recentWeeks[0]?.label ?? "—"}
              </p>
            </div>
            <div className="text-right">
              {currentWeekQuery.isLoading ? (
                <Spinner />
              ) : currentRank != null ? (
                <p className="text-3xl font-semibold bg-gradient-to-r from-pado-2 via-pado-4 to-pado-5 bg-clip-text text-transparent tabular-nums">
                  #{currentRank}
                  {trend === "up" && <span className="text-pado-4 text-base ml-2">▲</span>}
                  {trend === "down" && <span className="text-rose-400 text-base ml-2">▼</span>}
                </p>
              ) : (
                <p className="text-uju-secondary font-light text-sm">Unranked</p>
              )}
            </div>
          </div>

          {isExpanded && (
            <div className="space-y-2 animate-fade-in">
              <h6 className="text-sm font-semibold text-uju-secondary uppercase tracking-[0.2em] px-1 mt-2">
                Past Weeks
              </h6>
              <div className="space-y-1.5">
                {pastWeeks.map((w, i) => {
                  const q = pastQueries[i];
                  const rank = q?.data ? findRank(q.data) : null;
                  return (
                    <div
                      key={w.weekId}
                      className="flex items-center justify-between px-4 py-2.5 bg-uju-bg/30 rounded-lg border border-uju-border/10"
                    >
                      <span className="text-sm font-light text-uju-primary">{w.label}</span>
                      <span className="text-sm font-semibold tabular-nums">
                        {q?.isLoading ? (
                          <span className="text-uju-secondary/60">…</span>
                        ) : q?.isError ? (
                          <span className="text-rose-400/70">err</span>
                        ) : rank != null ? (
                          <span className="text-uju-primary">#{rank}</span>
                        ) : (
                          <span className="text-uju-secondary/60">Unranked</span>
                        )}
                      </span>
                    </div>
                  );
                })}
                {pastWeeks.length === 0 && (
                  <p className="text-sm font-light text-uju-secondary/70 text-center py-3">
                    No past weeks yet.
                  </p>
                )}
              </div>
              <Link
                to="/community/pado-leaderboard"
                className="flex items-center justify-center gap-2 py-3 mt-2 border-t border-uju-border/10 text-pado-2 hover:text-pado-4 font-semibold text-sm transition-all"
              >
                View Full Leaderboard →
              </Link>
            </div>
          )}
        </div>
      )}
    </UjuCard>
  );
};

export default UjuDefiLeaderboardHistoryCard;
