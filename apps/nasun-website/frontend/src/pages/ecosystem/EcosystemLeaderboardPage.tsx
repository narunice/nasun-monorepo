/**
 * Ecosystem Leaderboard Page
 *
 * Weekly leaderboard: on-chain activity diversity + creator posts + bonus.
 * No NFT multiplier applied to ranking. Resets every Monday 00:10 UTC.
 * Score = activity + FLOOR(creator/5) + FLOOR(bugreport+feedback/2) + FLOOR(game/3) + active_days*2
 */

import { useState, useEffect, useCallback, useRef } from "react";
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

  const colSpan = 4;

  return (
    <PageLayout>
      <Helmet>
        <title>Ecosystem Leaderboard - NASUN</title>
        <meta
          name="description"
          content="Nasun Ecosystem Leaderboard. Weekly rankings based on on-chain activity diversity and creator contributions."
        />
      </Helmet>

      <SectionLayout maxWidth="6xl" className="pt-8 md:pt-12">
        <div className="flex justify-end mt-2 md:mt-4 mb-2 items-center gap-2">
          <span className="text-sm font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
            Experimental Phase
          </span>
          <ExperimentalInfoTooltip />
        </div>
        <PageTitle as="h2">Ecosystem Leaderboard</PageTitle>

        {/* Scoring Info */}
        <div className="mb-6">
          <div className="">
            <p className="text-base text-nasun-white/90">
              Weekly rankings reset every Monday 00:10 UTC.
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
              Last Updated{" "}
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
                  <th className="px-4 py-3 text-left font-medium text-nasun-white/60 uppercase tracking-wide">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-nasun-white/60 uppercase tracking-wide">
                    User
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-nasun-white/60 uppercase tracking-wide">
                    Score
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-nasun-white/60 uppercase tracking-wide">
                    Change
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
                      className="border-b border-nasun-c3/15 transition-colors hover:bg-nasun-c3/8"
                    >
                      <td className="px-4 py-3 text-nasun-white/90">
                        <span className="inline-flex items-center gap-1.5">
                          {entry.rank <= 3 && (
                            <span className="text-base leading-none">
                              {entry.rank === 1
                                ? "🥇"
                                : entry.rank === 2
                                  ? "🥈"
                                  : "🥉"}
                            </span>
                          )}
                          <span className="font-mono">{entry.rank}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {entry.profileImageUrl ? (
                            <img
                              src={entry.profileImageUrl}
                              alt=""
                              className="w-12 h-12 rounded-lg shrink-0 object-cover bg-nasun-dark-500"
                              referrerPolicy="no-referrer"
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg shrink-0 bg-nasun-c6/60" />
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
                      <td className="px-4 py-3 text-right font-bold text-nasun-c3">
                        {Number(entry.weeklyScore).toLocaleString("en-US", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {entry.rankChange > 0 ? (
                          <span className="text-sm text-emerald-400">
                            +{entry.rankChange}
                          </span>
                        ) : entry.rankChange < 0 ? (
                          <span className="text-sm text-red-400">
                            {entry.rankChange}
                          </span>
                        ) : (
                          <span className="text-sm text-nasun-white/40">-</span>
                        )}
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
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-nasun-white/50">
              Showing {offset + 1}-
              {Math.min(offset + PAGE_SIZE, displayableTotal)} of{" "}
              {total.toLocaleString("en-US")} participants
              {cappedAt < total &&
                ` (top ${cappedAt.toLocaleString("en-US")} shown)`}
            </p>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="px-3 py-1.5 text-sm rounded-sm border border-nasun-c3/20 text-nasun-white/70 hover:text-nasun-white hover:border-nasun-c3/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <button
                disabled={offset + PAGE_SIZE >= displayableTotal}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="px-3 py-1.5 text-sm rounded-sm border border-nasun-c3/20 text-nasun-white/70 hover:text-nasun-white hover:border-nasun-c3/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* How Nasun Points Are Awarded */}
        <div className="mt-8 space-y-4">
          <h6 className="text-nasun-white uppercase tracking-wide">
            How Nasun Points Are Awarded
          </h6>
          <p className="text-base text-nasun-white/80">
            At the end of each week, our contributors are ranked by their
            ecosystem score and receive Nasun Points based on their final
            position.
          </p>
          <p className="text-base text-nasun-white/80">
            Nasun Ecosystem Leaderboard reflects the weekly activity and
            contributions. Weekly rankings reset every Monday and do not carry
            over.
          </p>
          {/* Row 1: Top 3 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "1st", pts: 50, crown: true },
              { label: "2nd", pts: 40, crown: false },
              { label: "3rd", pts: 30, crown: false },
            ].map(({ label, pts, crown }) => (
              <div
                key={label}
                className="flex items-center justify-between px-3 py-2.5 rounded-sm bg-pado-4/10 border border-pado-4/40"
              >
                <span className="text-base font-semibold text-pado-4">
                  {crown && <span className="mr-1">&#x1F451;</span>}
                  {label}
                </span>
                <span className="text-base font-bold text-pado-4">
                  {pts} pts
                </span>
              </div>
            ))}
          </div>

          {/* Row 2: Top 50 / 100 / 200 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Top 50", pts: 15 },
              { label: "Top 100", pts: 10 },
              { label: "Top 200", pts: 6 },
            ].map(({ label, pts }) => (
              <div
                key={label}
                className="flex items-center justify-between px-3 py-2 rounded-sm bg-pd1/30 border border-pd2/25"
              >
                <span className="text-base text-pado-2">{label}</span>
                <span className="text-base font-bold text-pado-3">
                  {pts} pts
                </span>
              </div>
            ))}
          </div>

          {/* Row 3: Top 300 / 400 / 500 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Top 300", pts: 5 },
              { label: "Top 400", pts: 2 },
              { label: "Top 500", pts: 1 },
            ].map(({ label, pts }) => (
              <div
                key={label}
                className="flex items-center justify-between px-3 py-2 rounded-sm bg-pd1/30 border border-pd2/25"
              >
                <span className="text-base text-pado-2">{label}</span>
                <span className="text-base font-bold text-pado-3">
                  {pts} pts
                </span>
              </div>
            ))}
          </div>

          {/* Genesis Pass 2x banner */}
          <div className="flex items-center gap-3 ">
            <span className="text-xl">&#x2728;</span>
            <div>
              <span className="text-base font-semibold text-nasun-white">
                Genesis Pass Holders
              </span>
              <span className="text-base text-nasun-white/80"> receive a </span>
              <span className="text-base font-semibold text-nasun-white">
                2x multiplier
              </span>
              <span className="text-base text-nasun-white/80">
                {" "}
                on all point payouts.
              </span>
            </div>
          </div>
        </div>
      </SectionLayout>
    </PageLayout>
  );
};

function ExperimentalInfoTooltip() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-nasun-white/50 text-sm leading-none text-nasun-white/70 hover:border-nasun-white/80 hover:text-nasun-white transition-colors"
        aria-label="More info"
      >
        i
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border border-nasun-c6/60 bg-nasun-c6 p-3 text-left text-sm leading-snug text-nasun-white/70 shadow-lg">
          <p className="text-amber-400 font-semibold mb-1.5">
            Experimental Phase
          </p>
          <p>
            The leaderboard and points system are currently in an experimental
            phase and may be buggy. As real user data accumulates, the scoring
            formula may be rebalanced at any time to ensure fair competition.
          </p>
        </div>
      )}
    </div>
  );
}

function truncateId(id: string | null | undefined): string {
  if (!id) return "Unknown";
  const parts = id.split(":");
  if (parts.length === 2) {
    const uuid = parts[1];
    return `...${uuid.slice(-8)}`;
  }
  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-6)}` : id;
}

export default EcosystemLeaderboardPage;
