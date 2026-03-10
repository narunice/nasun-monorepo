/**
 * LeaderboardViewTab - Leaderboard view for Leaderboard V3 Admin
 *
 * Features:
 * - Season Leaderboard / Cumulative (All-time) toggle
 * - Season selector + Snapshot date picker
 * - Score breakdown modal
 * - CSV Export
 */

import { useState, useMemo, useEffect } from "react";
import { OuterBox } from "@/components/ui/OuterBox";
import { Button } from "@/components/ui/button";
import { useSeasons } from "@/features/leaderboard-v3/hooks/useSeasons";
import { useSeasonLeaderboard } from "@/features/leaderboard-v3/hooks/useSeasonLeaderboard";
import { SeasonSelector } from "@/features/leaderboard-v3/components/SeasonSelector";
import { RankChangeIndicatorV3 } from "@/features/leaderboard-v3/components/RankChangeIndicatorV3";
import { useCumulativeLeaderboard } from "../../hooks/useCumulativeLeaderboard";
import { cn } from "../../../../utils/utils";
import type { RankChange } from "@/features/leaderboard-v3/types";

const PAGE_SIZE = 50;

type ViewMode = "season" | "cumulative";

interface DisplayEntry {
  rank: number;
  username: string;
  originalUsername?: string; // Original casing for display
  platform: string;
  userScore: number;
  postCount: number;
  uniqueActiveDays: number;
  lastActivity: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
  rankChange?: RankChange;
}

export function LeaderboardViewTab() {
  const [viewMode, setViewMode] = useState<ViewMode>("season");
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | undefined>();

  const { data: seasons = [] } = useSeasons();

  // Season leaderboard (for season mode)
  const { data: seasonLeaderboard, isLoading: isSeasonLoading } = useSeasonLeaderboard({
    seasonId: selectedSeasonId,
    limit: 500,
    breakdown: true,
  });

  // Cumulative leaderboard (for cumulative mode)
  const { data: cumulativeLeaderboard, isLoading: isCumulativeLoading } = useCumulativeLeaderboard({
    limit: 500,
    breakdown: true,
    enabled: viewMode === "cumulative",
  });

  // Select data based on view mode
  const isLoading = viewMode === "season" ? isSeasonLoading : isCumulativeLoading;
  const entries: DisplayEntry[] = useMemo(() => {
    if (viewMode === "season") {
      return seasonLeaderboard?.entries || [];
    }
    return cumulativeLeaderboard?.entries || [];
  }, [viewMode, seasonLeaderboard, cumulativeLeaderboard]);

  const totalCount =
    viewMode === "season"
      ? seasonLeaderboard?.totalCount || 0
      : cumulativeLeaderboard?.totalCount || 0;

  const calculatedAt =
    viewMode === "season" ? seasonLeaderboard?.calculatedAt : cumulativeLeaderboard?.calculatedAt;

  // Client-side pagination
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [viewMode, selectedSeasonId]);
  const visibleEntries = entries.slice(0, visibleCount);
  const hasMore = visibleCount < entries.length;
  const remaining = entries.length - visibleCount;

  // Export to CSV
  const handleExportCsv = () => {
    if (!entries.length) return;

    const headers = ["Rank", "Username", "Platform", "Score", "Posts", "Days", "Last Activity"];
    const rows = entries.map((e) => [
      e.rank,
      e.username,
      e.platform,
      e.userScore,
      e.postCount,
      e.uniqueActiveDays,
      e.lastActivity,
    ]);

    const csvContent = [headers, ...rows].map((row) => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `leaderboard-${viewMode}-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* View Mode Toggle */}
      <OuterBox color="c6" padding="sm" className="w-full !border-nasun-c5/30 !bg-gray-800/30">
        <div className="flex items-center gap-4">
          <span className="text-sm text-nasun-white/60">View Mode:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("season")}
              className={cn(
                "px-4 py-2 rounded-sm text-sm font-medium transition-all",
                viewMode === "season"
                  ? "bg-nasun-c4 text-nasun-white"
                  : "bg-gray-700/50 text-nasun-white/60 hover:text-nasun-white",
              )}
            >
              Season Leaderboard
            </button>
            <button
              onClick={() => setViewMode("cumulative")}
              className={cn(
                "px-4 py-2 rounded-sm text-sm font-medium transition-all",
                viewMode === "cumulative"
                  ? "bg-nasun-c4 text-nasun-white"
                  : "bg-gray-700/50 text-nasun-white/60 hover:text-nasun-white",
              )}
            >
              Cumulative (All-time)
            </button>
          </div>
        </div>
      </OuterBox>

      {/* Season Selector (only for season mode) */}
      {viewMode === "season" && (
        <OuterBox color="c6" padding="sm" className="w-full !border-nasun-c5/30 !bg-gray-800/30">
          <div className="flex items-center gap-4">
            <span className="text-sm text-nasun-white/60">Season:</span>
            <SeasonSelector
              seasons={seasons}
              selectedSeasonId={selectedSeasonId}
              onSelect={setSelectedSeasonId}
            />
          </div>
        </OuterBox>
      )}

      {/* Cumulative Mode Notice */}
      {viewMode === "cumulative" && (
        <OuterBox color="n3" padding="sm" className="w-full">
          <div className="text-sm text-nasun-white/80">
            <strong>Cumulative View:</strong> Shows all-time rankings across all seasons. This view
            is admin-only and requires authentication.
          </div>
        </OuterBox>
      )}

      {/* Leaderboard Table */}
      <OuterBox color="c6" className="w-full !border-nasun-c5/30 !bg-gray-800/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-nasun-white">
            {viewMode === "season" ? "Season Leaderboard" : "Cumulative Leaderboard"}
          </h3>
          <Button
            onClick={handleExportCsv}
            variant="outlineC5"
            size="sm"
            disabled={!entries.length}
          >
            Export CSV
          </Button>
        </div>

        {isLoading ? (
          <div className="text-nasun-white/50 text-sm py-8 text-center">Loading...</div>
        ) : !entries.length ? (
          <div className="text-nasun-white/50 text-sm py-8 text-center">No data available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nasun-c5/20">
                  <th className="text-left py-3 px-2 text-nasun-white/50 font-medium">#</th>
                  <th className="text-left py-3 px-2 text-nasun-white/50 font-medium">User</th>
                  <th className="text-right py-3 px-2 text-nasun-white/50 font-medium">Posts</th>
                  <th className="text-right py-3 px-2 text-nasun-white/50 font-medium">Days</th>
                  <th className="text-right py-3 px-2 text-nasun-white/50 font-medium">Score</th>
                  {viewMode === "season" && (
                    <th className="text-right py-3 px-2 text-nasun-white/50 font-medium">Change</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry) => (
                  <tr
                    key={`${entry.username}-${entry.platform}`}
                    className="border-b border-nasun-c5/10 hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="py-3 px-2 text-nasun-white/80 font-mono">{entry.rank}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        {entry.profileImageUrl ? (
                          <img
                            src={entry.profileImageUrl}
                            alt={entry.originalUsername || entry.username}
                            className="w-6 h-6 rounded-full"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-nasun-c5/30" />
                        )}
                        <a
                          href={`https://x.com/${entry.originalUsername || entry.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline"
                        >
                          @{entry.originalUsername || entry.username}
                        </a>
                        {entry.isRegistered && <span className="text-nasun-c7 text-xs">✓</span>}
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right text-nasun-white/80">{entry.postCount}</td>
                    <td className="py-3 px-2 text-right text-nasun-white/80">
                      {entry.uniqueActiveDays}
                    </td>
                    <td className="py-3 px-2 text-right text-nasun-c3 font-medium">
                      {entry.userScore.toFixed(2)}
                    </td>
                    {viewMode === "season" && (
                      <td className="py-3 px-2 text-right">
                        {entry.rankChange && (
                          <RankChangeIndicatorV3
                            direction={entry.rankChange.direction}
                            amount={entry.rankChange.amount}
                            variant="short"
                          />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {entries.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs text-nasun-white/50">
              <span>
                Showing {visibleEntries.length} of {totalCount}
              </span>
              {calculatedAt && <span>Last updated: {new Date(calculatedAt).toLocaleString()}</span>}
            </div>
            {hasMore && (
              <button
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="w-full py-2 text-sm text-nasun-c4 hover:text-nasun-white bg-gray-700/30 hover:bg-gray-700/50 rounded-sm transition-colors"
              >
                View More ({remaining} remaining)
              </button>
            )}
          </div>
        )}
      </OuterBox>
    </div>
  );
}
