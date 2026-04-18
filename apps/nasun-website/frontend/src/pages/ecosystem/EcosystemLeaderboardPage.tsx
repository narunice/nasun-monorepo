/**
 * Ecosystem Leaderboard Page
 *
 * Weekly leaderboard: on-chain activity diversity + creator posts + bonus.
 * No NFT multiplier applied to ranking. Resets every Monday 00:10 UTC.
 * Score = activity + FLOOR(creator/5) + FLOOR(bugreport+feedback/2) + FLOOR(game/3) + active_days*2
 */

import { useState, useEffect, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { PageTitle } from "../../components/ui/PageTitle";
import { GenesisPassBadge } from "@nasun/wallet-ui";
import {
  getEcosystemLeaderboard,
  getAvailableEcosystemWeeks,
  isEcosystemNewWeekGracePeriod,
  type EcosystemLeaderboardEntry,
  type EcosystemLeaderboardResponse,
  type AvailableEcosystemWeek,
} from "@/services/ecosystemScoreApi";

const PAGE_SIZE = 50;

const EcosystemLeaderboardPage = () => {
  const [viewMode, setViewMode] = useState<"current" | "past">("current");
  const [selectedWeekId, setSelectedWeekId] = useState<string | undefined>(
    undefined,
  );
  const [availableWeeks, setAvailableWeeks] = useState<
    AvailableEcosystemWeek[]
  >([]);
  const [response, setResponse] = useState<EcosystemLeaderboardResponse | null>(
    null,
  );
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAvailableEcosystemWeeks()
      .then(setAvailableWeeks)
      .catch(() => {});
  }, []);

  const pastWeeks = availableWeeks.slice(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const weekId = viewMode === "current" ? undefined : selectedWeekId;
      const res = await getEcosystemLeaderboard(weekId, PAGE_SIZE, offset);
      setResponse(res);
    } catch (err) {
      setError("Failed to load leaderboard. Please try again.");
      console.error("[EcosystemLeaderboard]", err);
    } finally {
      setLoading(false);
    }
  }, [viewMode, selectedWeekId, offset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleViewModeChange = (mode: "current" | "past") => {
    setViewMode(mode);
    setOffset(0);
    if (mode === "past" && pastWeeks.length > 0 && !selectedWeekId) {
      setSelectedWeekId(pastWeeks[0].weekId);
    }
  };

  const entries: EcosystemLeaderboardEntry[] = response?.data ?? [];
  const total = response?.meta.total ?? 0;
  const cappedAt = response?.meta.cappedAt ?? total;
  const displayableTotal = Math.min(total, cappedAt);
  const inGracePeriod =
    viewMode === "current" && isEcosystemNewWeekGracePeriod(response?.meta);
  const weekStart = response?.meta.weekStart;
  const updatedAt = response?.meta.updatedAt;

  const colSpan = 7;

  return (
    <PageLayout>
      <Helmet>
        <title>Ecosystem Leaderboard - NASUN</title>
        <meta
          name="description"
          content="Nasun Ecosystem Leaderboard. Weekly rankings based on on-chain activity diversity and creator contributions."
        />
      </Helmet>

      <SectionLayout maxWidth="7xl" className="pt-8 md:pt-12">
        <PageTitle as="h2">Ecosystem Leaderboard</PageTitle>

        {/* Scoring Info */}
        <div className="mb-6">
          <div className="rounded-sm border border-nasun-c3/10 bg-nasun-c6/25 p-3">
            <p className="text-sm font-medium text-nasun-c3/90">Weekly Score</p>
            <p className="text-sm text-nasun-white/90">
              Nasun Ecosystem Leaderboard reflects the weekly activity and
              contributions. Resets every Monday 00:10 UTC.
            </p>
          </div>
        </div>

        {/* Meta bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* View mode toggle */}
            <div className="flex items-center rounded-sm border border-nasun-c3/20 overflow-hidden">
              <button
                onClick={() => handleViewModeChange("current")}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  viewMode === "current"
                    ? "bg-nasun-c3/20 text-nasun-c3 font-medium"
                    : "text-nasun-white/70 hover:text-nasun-white"
                }`}
              >
                Current Week
              </button>
              <button
                onClick={() => handleViewModeChange("past")}
                disabled={pastWeeks.length === 0}
                className={`px-3 py-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  viewMode === "past"
                    ? "bg-nasun-c3/20 text-nasun-c3 font-medium"
                    : "text-nasun-white/70 hover:text-nasun-white"
                }`}
              >
                Past Weeks
              </button>
            </div>

            {/* Past week selector */}
            {viewMode === "past" && pastWeeks.length > 0 && (
              <select
                value={selectedWeekId ?? pastWeeks[0].weekId}
                onChange={(e) => {
                  setSelectedWeekId(e.target.value);
                  setOffset(0);
                }}
                className="text-sm bg-nasun-c6/40 text-nasun-white border border-nasun-c3/20 rounded-sm px-2 py-1.5 focus:outline-none focus:border-nasun-c3/40"
              >
                {pastWeeks.map((w) => (
                  <option key={w.weekId} value={w.weekId}>
                    {w.label}
                  </option>
                ))}
              </select>
            )}

            {/* Current week reset info */}
            {viewMode === "current" && weekStart && (
              <span className="text-sm text-nasun-white/60">
                Resets{" "}
                {new Date(weekStart + 7 * 24 * 60 * 60 * 1000).toLocaleString(
                  "en-US",
                  {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZoneName: "short",
                  },
                )}
              </span>
            )}
          </div>

          {updatedAt && updatedAt > 0 && (
            <span className="text-sm text-nasun-white/50">
              Updated{" "}
              {new Date(updatedAt).toLocaleString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
          )}
        </div>

        {/* Grace period notice */}
        {inGracePeriod && (
          <div className="mb-4 rounded-sm border border-nasun-c3/20 bg-nasun-c6/30 px-4 py-3">
            <p className="text-sm font-medium text-nasun-white">
              Week just reset. Scores are updating...
            </p>
            <p className="text-sm text-nasun-white/60 mt-1">
              New scores will appear within the next 12 hours.
            </p>
          </div>
        )}

        {/* Table */}
        {error ? (
          <div className="rounded-sm bg-red-500/10 p-4 text-center text-sm text-red-400">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-nasun-c3/15 bg-nasun-c6/20">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nasun-c3/15 bg-nasun-c3/5">
                  <th className="px-4 py-3 text-left font-medium text-nasun-white/80">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-nasun-white/80">
                    User
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-nasun-white/80">
                    Activity
                  </th>
                  <th className="hidden px-4 py-3 text-right font-medium text-nasun-white/80 sm:table-cell">
                    Creator
                  </th>
                  <th className="hidden px-4 py-3 text-right font-medium text-nasun-white/80 sm:table-cell">
                    Bonus
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-nasun-white/80">
                    Days
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-nasun-white/80">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={colSpan}
                      className="px-4 py-12 text-center text-nasun-white/70"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <svg
                          className="h-10 w-10 text-nasun-c3/40"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                        <p className="text-sm text-nasun-white/70">
                          No activity recorded yet. Start using the ecosystem to
                          appear here!
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr
                      key={entry.identityId}
                      className="border-b border-nasun-c3/8 transition-colors hover:bg-nasun-c3/8"
                    >
                      <td className="px-4 py-3 font-mono text-nasun-white/90">
                        #{entry.rank}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {entry.profileImageUrl ? (
                            <img
                              src={entry.profileImageUrl}
                              alt=""
                              className="w-6 h-6 rounded-full shrink-0 object-cover bg-nasun-dark-500"
                              referrerPolicy="no-referrer"
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full shrink-0 bg-nasun-c6/60" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm text-nasun-white truncate">
                                {entry.displayName ??
                                  (entry.xHandle
                                    ? `@${entry.xHandle}`
                                    : truncateId(entry.identityId))}
                              </span>
                              {entry.hasGenesisPass && <GenesisPassBadge />}
                            </div>
                            {entry.displayName && entry.xHandle && (
                              <a
                                href={`https://x.com/${entry.xHandle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-nasun-white/50 hover:text-nasun-white/70 truncate block transition-colors"
                              >
                                @{entry.xHandle}
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-nasun-white">
                        {entry.activityScore}
                      </td>
                      <td className="hidden px-4 py-3 text-right sm:table-cell">
                        <span
                          className={`font-mono ${entry.creatorPostScore > 0 ? "text-nasun-c3 font-medium" : "text-nasun-white/50"}`}
                        >
                          {entry.creatorPostScore > 0
                            ? `+${Number(entry.creatorPostScore).toLocaleString("en-US", { maximumFractionDigits: 1 })}`
                            : "-"}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 text-right sm:table-cell">
                        <span
                          className={`font-mono ${entry.bonusScore > 0 ? "text-nasun-c3 font-medium" : "text-nasun-white/50"}`}
                        >
                          {entry.bonusScore > 0
                            ? `+${Number(entry.bonusScore).toLocaleString("en-US", { maximumFractionDigits: 1 })}`
                            : "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-nasun-white/80">
                        {entry.activeDays}/7
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-nasun-c3">
                        {Number(entry.weeklyScore).toLocaleString("en-US", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {displayableTotal > PAGE_SIZE && (
          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-sm text-nasun-white/70">
              Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, displayableTotal)} of{" "}
              {total.toLocaleString("en-US")} participants
              {cappedAt < total && ` (top ${cappedAt.toLocaleString("en-US")} shown)`}
            </p>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="min-h-[44px] rounded-sm bg-nasun-c6/30 px-4 py-1.5 text-sm text-nasun-white transition-colors hover:bg-nasun-c3/8 disabled:opacity-30"
              >
                Previous
              </button>
              <button
                disabled={offset + PAGE_SIZE >= displayableTotal}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="min-h-[44px] rounded-sm bg-nasun-c6/30 px-4 py-1.5 text-sm text-nasun-white transition-colors hover:bg-nasun-c3/8 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </SectionLayout>
    </PageLayout>
  );
};

function truncateId(id: string): string {
  const parts = id.split(":");
  if (parts.length === 2) {
    const uuid = parts[1];
    return `...${uuid.slice(-8)}`;
  }
  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-6)}` : id;
}

export default EcosystemLeaderboardPage;
