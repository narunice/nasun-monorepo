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
  LeaderboardSearchBox,
  type LeaderboardSearchResult,
} from "../../components/ui/LeaderboardSearchBox";
import { useHighlightRow } from "../../hooks/useHighlightRow";
import {
  isEcosystemNewWeekGracePeriod,
  type EcosystemLeaderboardEntry,
} from "@/services/ecosystemScoreApi";
import {
  useEcosystemLeaderboard,
  useAvailableEcosystemWeeks,
} from "./useEcosystemLeaderboard";

const PAGE_SIZE = 50;
const MAX_RANK = 2000;
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,50}$/;

function isValidXHandle(h: string | null | undefined): h is string {
  return typeof h === "string" && X_HANDLE_RE.test(h);
}

const EcosystemLeaderboardPage = () => {
  const [viewMode, setViewMode] = useState<"current" | "past">("current");
  const [selectedWeekId, setSelectedWeekId] = useState<string | undefined>(
    undefined,
  );
  const [page, setPage] = useState(1);

  const weeksQuery = useAvailableEcosystemWeeks();
  const availableWeeks = weeksQuery.data ?? [];
  const pastWeeks = availableWeeks.slice(1);

  const weekIdForQuery = viewMode === "current" ? undefined : selectedWeekId;
  const leaderboardQuery = useEcosystemLeaderboard(
    weekIdForQuery,
    viewMode === "current" || !!selectedWeekId,
  );

  const allEntries: EcosystemLeaderboardEntry[] =
    leaderboardQuery.data?.data ?? [];
  const displayedCount = Math.min(allEntries.length, MAX_RANK);
  const totalPages = Math.ceil(displayedCount / PAGE_SIZE);
  const pagedEntries = allEntries.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const inGracePeriod =
    viewMode === "current" &&
    isEcosystemNewWeekGracePeriod(leaderboardQuery.data?.meta);
  const weekStart = leaderboardQuery.data?.meta.weekStart;
  const updatedAt = leaderboardQuery.data?.meta.updatedAt;

  const { highlightedId, selectRow } = useHighlightRow({
    dataAttribute: "data-identity-id",
    pageSize: PAGE_SIZE,
    page,
    setPage,
  });

  const filterFn = useCallback(
    (entry: EcosystemLeaderboardEntry, query: string): boolean => {
      const q = query.toLowerCase();
      return (
        (entry.xHandle ?? "").toLowerCase().includes(q) ||
        (entry.displayName ?? "").toLowerCase().includes(q)
      );
    },
    [],
  );

  const toResult = useCallback(
    (entry: EcosystemLeaderboardEntry): LeaderboardSearchResult => {
      const primary =
        entry.displayName ?? entry.xHandle ?? truncateId(entry.identityId);
      const secondary = entry.xHandle ? `@${entry.xHandle}` : undefined;
      return {
        id: entry.identityId,
        primaryLabel: primary,
        secondaryLabel: secondary !== primary ? secondary : undefined,
        rank: entry.rank,
        profileImageUrl: entry.profileImageUrl,
      };
    },
    [],
  );

  const handleUserSelect = useCallback(
    (result: LeaderboardSearchResult) => {
      if (result.rank != null) {
        selectRow(result.id, result.rank);
      }
    },
    [selectRow],
  );

  const handleViewModeChange = (mode: "current" | "past") => {
    setViewMode(mode);
    setPage(1);
    if (mode === "past" && pastWeeks.length > 0) {
      // Always reset to most recent past week on mode entry.
      setSelectedWeekId(pastWeeks[0].weekId);
    }
  };

  const colSpan = 7;
  const isLoading = leaderboardQuery.isLoading;
  const isError = leaderboardQuery.isError;

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

        <div className="mb-6">
          <p className="text-base text-nasun-white/90">
            Weekly rankings reset every Monday 00:10 UTC.
          </p>
        </div>

        {/* Meta bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
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

            {viewMode === "past" && pastWeeks.length > 0 && (
              <select
                value={selectedWeekId ?? pastWeeks[0].weekId}
                onChange={(e) => {
                  setSelectedWeekId(e.target.value);
                  setPage(1);
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

          <div className="flex items-center gap-3">
            {updatedAt && updatedAt > 0 && (
              <span className="text-sm text-nasun-white/50 whitespace-nowrap">
                Last Updated{" "}
                {new Date(updatedAt).toLocaleString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </span>
            )}
            <LeaderboardSearchBox
              entries={allEntries}
              filterFn={filterFn}
              toResult={toResult}
              onSelect={handleUserSelect}
              placeholder="Search by handle or display name..."
              disabled={isLoading}
            />
          </div>
        </div>

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

        {isError ? (
          <div className="rounded-sm bg-red-500/10 p-4 text-center text-sm text-red-400 flex items-center justify-center gap-3">
            <span>Failed to load leaderboard.</span>
            <button
              onClick={() => leaderboardQuery.refetch()}
              className="underline hover:no-underline"
            >
              Try again
            </button>
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
                  <th className="px-2 py-3 text-center font-medium text-nasun-white/60 w-8" aria-label="Twitter" title="Twitter">
                    <svg className="w-3.5 h-3.5 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </th>
                  <th className="px-2 py-3 text-center font-medium text-nasun-white/60 w-8" aria-label="Google" title="Google">
                    <svg className="w-3.5 h-3.5 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  </th>
                  <th className="px-2 py-3 text-center font-medium text-nasun-white/60 w-8" aria-label="Telegram" title="Telegram">
                    <svg className="w-3.5 h-3.5 mx-auto text-nasun-white/60" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.820 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
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
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={colSpan}
                      className="px-4 py-12 text-center text-nasun-white/70"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : pagedEntries.length === 0 ? (
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
                  pagedEntries.map((entry) => {
                    const isHighlighted = highlightedId === entry.identityId;
                    return (
                      <tr
                        key={entry.identityId}
                        data-identity-id={entry.identityId}
                        className={`border-b border-nasun-c3/15 transition-colors hover:bg-nasun-c3/8 ${
                          isHighlighted
                            ? "bg-nasun-nw2/20 border-l-2 border-nasun-nw1"
                            : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-nasun-white/90">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-mono">{entry.rank}</span>
                            {entry.rank <= 3 && (
                              <span className="text-base leading-none">
                                {entry.rank === 1
                                  ? "🥇"
                                  : entry.rank === 2
                                    ? "🥈"
                                    : "🥉"}
                              </span>
                            )}
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
                                    (isValidXHandle(entry.xHandle)
                                      ? `@${entry.xHandle}`
                                      : truncateId(entry.identityId))}
                                </span>
                                {entry.hasGenesisPass && <GenesisPassBadge />}
                              </div>
                              {entry.displayName &&
                                isValidXHandle(entry.xHandle) && (
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
                        <td className="px-2 py-3 text-center w-8">
                          {entry.xHandle ? (
                            <svg className="w-3 h-3 mx-auto text-sky-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                          ) : null}
                        </td>
                        <td className="px-2 py-3 text-center w-8">
                          {entry.hasGoogle ? (
                            <svg className="w-3 h-3 mx-auto text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                          ) : null}
                        </td>
                        <td className="px-2 py-3 text-center w-8">
                          {entry.isTelegramMember ? (
                            <svg className="w-3 h-3 mx-auto text-violet-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                          ) : null}
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
                            <span className="text-sm text-nasun-white/40">
                              -
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-nasun-white/50">
              Showing {(page - 1) * PAGE_SIZE + 1}-
              {Math.min(page * PAGE_SIZE, displayedCount)} of top{" "}
              {displayedCount.toLocaleString("en-US")}
              {(leaderboardQuery.data?.meta.total ?? 0) > 0 && (
                <>
                  {" "}
                  (Weekly total participants:{" "}
                  {leaderboardQuery.data!.meta.total.toLocaleString("en-US")})
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-sm rounded-sm border border-nasun-c3/20 text-nasun-white/70 hover:text-nasun-white hover:border-nasun-c3/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="text-sm text-nasun-white/50">
                {page} / {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 text-sm rounded-sm border border-nasun-c3/20 text-nasun-white/70 hover:text-nasun-white hover:border-nasun-c3/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
              <input
                type="number"
                min={1}
                max={totalPages}
                placeholder="Go"
                className="w-14 px-2 py-1.5 text-sm rounded-sm border border-nasun-c3/20 bg-transparent text-nasun-white/70 text-center focus:outline-none focus:border-nasun-c3/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = Math.min(
                      Math.max(1, parseInt(e.currentTarget.value, 10)),
                      totalPages,
                    );
                    if (!isNaN(v)) {
                      setPage(v);
                      e.currentTarget.value = "";
                    }
                  }
                }}
              />
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
          <p className="text-base text-nasun-white/80">
            To be eligible for leaderboard rewards, users must have at least one
            social account connected to their profile. Users without any linked
            social account will not receive point payouts, even if they rank
            within the top 2000.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "1st", pts: 50, crown: true },
              { label: "2nd", pts: 45, crown: false },
              { label: "3rd", pts: 40, crown: false },
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
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Top 10", pts: 35 },
              { label: "Top 20", pts: 30 },
              { label: "Top 50", pts: 25 },
              { label: "Top 100", pts: 20 },
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
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Top 200", pts: 15 },
              { label: "Top 300", pts: 10 },
              { label: "Top 500", pts: 8 },
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
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Top 1000", pts: 6 },
              { label: "Top 2000", pts: 5 },
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
          <div className="flex items-center gap-3">
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
  if (parts.length === 2) return `...${parts[1].slice(-8)}`;
  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-6)}` : id;
}

export default EcosystemLeaderboardPage;
