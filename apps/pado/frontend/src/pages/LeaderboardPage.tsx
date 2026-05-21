import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useWallet,
  useZkLogin,
  useSignerAddress,
  usePasskeyStore,
} from "@nasun/wallet";
import {
  useLeaderboard,
  usePnlLeaderboard,
  useScoreLeaderboard,
  usePreviousWeekScoreLeaderboard,
  useAvailableWeeks,
  getWeekId,
  LeaderboardTable,
  PnlLeaderboardTable,
  ScoreLeaderboardTable,
  PeriodSelector,
  ModeSelector,
  ScopeSelector,
  WeekPicker,
  MyRankCard,
} from "../features/leaderboard";
import { Pagination } from "../features/leaderboard/components/Pagination";
import { CompetitionBanner } from "../features/competitions";
import { ActivityFeed } from "../features/social/components/ActivityFeed";
import { LeaderboardSearchBox, type LeaderboardSearchResult } from "../components/ui/LeaderboardSearchBox";
import { useHighlightRow } from "../hooks/useHighlightRow";
import type {
  Period,
  LeaderboardMode,
  ViewMode,
  ScoreLeaderboardTrader,
} from "../features/leaderboard";

const PAGE_SIZE = 50;
const MAX_RANK = 1000;
const MAX_PAGES = Math.ceil(MAX_RANK / PAGE_SIZE); // 40

const MODE_DESCRIPTIONS: Record<LeaderboardMode, string> = {
  activity: "Recent trades from traders you follow",
  volume: "Top traders ranked by volume",
  pnl: "Top traders ranked by realized PnL",
  score: "Weekly Pado Score from trades, volume, and performance",
};

export function LeaderboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [period, setPeriod] = useState<Period>("7d");

  const VALID_MODES: LeaderboardMode[] = ["activity", "volume", "pnl", "score"];
  const rawTab = searchParams.get("tab") as LeaderboardMode | null;
  const mode: LeaderboardMode = rawTab && VALID_MODES.includes(rawTab) ? rawTab : "score";

  const [viewMode, setViewMode] = useState<ViewMode>("current");
  const [showFollowing, setShowFollowing] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedWeekId, setSelectedWeekId] = useState(() => getWeekId(0));

  const currentWeekId = getWeekId(0);
  const offset = (page - 1) * PAGE_SIZE;

  const availableWeeksQuery = useAvailableWeeks();
  // Pado DeFi leaderboard launched W17/2026; W16 and earlier are pre-launch noise.
  const PADO_LEADERBOARD_LAUNCH_WEEK_ID = "2026-W17";
  const pastWeeks = (availableWeeksQuery.data?.weeks ?? []).filter(
    (w) =>
      w.weekId !== currentWeekId &&
      w.weekId >= PADO_LEADERBOARD_LAUNCH_WEEK_ID,
  );

  const volumeQuery = useLeaderboard(period, PAGE_SIZE, offset);
  const pnlQuery = usePnlLeaderboard(period, PAGE_SIZE, offset);
  // Score mode fetches the full week (up to MAX_RANK) so client-side search
  // can match against every trader, not just the current page.
  const scoreQuery = useScoreLeaderboard(
    viewMode,
    selectedWeekId,
    MAX_RANK,
    0,
  );
  const allScoreTraders: ScoreLeaderboardTrader[] = scoreQuery.data?.traders ?? [];
  const cappedScoreTraders = useMemo(
    () => allScoreTraders.slice(0, MAX_RANK),
    [allScoreTraders],
  );
  const pagedScoreTraders = useMemo(
    () => cappedScoreTraders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [cappedScoreTraders, page],
  );

  const activeData =
    mode === "pnl"
      ? pnlQuery.data
      : mode === "score"
        ? scoreQuery.data
        : volumeQuery.data;

  const activeLoading =
    mode === "pnl"
      ? pnlQuery.isLoading
      : mode === "score"
        ? scoreQuery.isLoading
        : volumeQuery.isLoading;

  // Grace period: only applies when viewing the current week
  const WEEK_GRACE_PERIOD_MS = 2 * 60 * 60 * 1000;
  const scoreData = scoreQuery.data;
  const isCurrentWeek = viewMode === "current";
  const isNewWeek =
    mode === "score" &&
    isCurrentWeek &&
    !activeLoading &&
    scoreData !== undefined &&
    !!scoreData.weekStart &&
    Date.now() - scoreData.weekStart < WEEK_GRACE_PERIOD_MS;
  const showNoData =
    mode === "score" &&
    !isCurrentWeek &&
    !activeLoading &&
    scoreData !== undefined &&
    scoreData.traders.length === 0;

  const prevWeekQuery = usePreviousWeekScoreLeaderboard(
    isNewWeek,
    PAGE_SIZE,
    0,
  );

  const totalTraders = activeData?.totalTraders ?? 0;
  const totalPages = Math.min(Math.ceil(totalTraders / PAGE_SIZE), MAX_PAGES);

  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const signerAddress = useSignerAddress();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected =
    (status === "unlocked" && account) || isZkLoggedIn || isPasskeyUnlocked;
  const userAddress = signerAddress || null;

  const { highlightedId, selectRow } = useHighlightRow({
    dataAttribute: "data-address",
    pageSize: PAGE_SIZE,
    page,
    setPage,
  });

  const scoreFilterFn = useCallback(
    (entry: ScoreLeaderboardTrader, q: string): boolean => {
      return (
        entry.address.toLowerCase().includes(q) ||
        (entry.twitterHandle ?? "").toLowerCase().includes(q) ||
        (entry.nickname ?? "").toLowerCase().includes(q)
      );
    },
    [],
  );

  const scoreToResult = useCallback(
    (entry: ScoreLeaderboardTrader): LeaderboardSearchResult => {
      const shortAddr = `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`;
      const primary = entry.nickname ?? (entry.twitterHandle ? `@${entry.twitterHandle}` : shortAddr);
      const secondary = entry.twitterHandle && entry.nickname ? `@${entry.twitterHandle}` : shortAddr;
      return {
        id: entry.address,
        primaryLabel: primary,
        secondaryLabel: secondary !== primary ? secondary : undefined,
        rank: entry.rank,
        profileImageUrl: entry.profileImageUrl,
      };
    },
    [],
  );

  const handleSearchSelect = useCallback(
    (result: LeaderboardSearchResult) => {
      if (result.rank != null) selectRow(result.id, result.rank);
    },
    [selectRow],
  );

  // Reset page to 1 when mode or period changes
  const handleModeChange = useCallback((m: LeaderboardMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", m);
      return next;
    });
    setPage(1);
  }, [setSearchParams]);

  const handlePeriodChange = useCallback((p: Period) => {
    setPeriod(p);
    setPage(1);
  }, []);

  const handleViewModeChange = useCallback(
    (newMode: ViewMode) => {
      setViewMode(newMode);
      setPage(1);
      if (newMode === "past") {
        if (pastWeeks.length > 0) setSelectedWeekId(pastWeeks[0].weekId);
      } else {
        setSelectedWeekId(currentWeekId);
      }
    },
    [pastWeeks, currentWeekId],
  );

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-theme-text-primary">
              Leaderboard
            </h1>
            <span className="text-xs font-bold tracking-wider text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-400/10 border border-yellow-300 dark:border-yellow-400/30 px-2 py-0.5 rounded">
              Experimental Phase
            </span>
          </div>
          <p className="text-sm text-theme-text-muted mt-0.5">
            {MODE_DESCRIPTIONS[mode]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode !== "activity" && (
            <button
              onClick={() => setShowFollowing(!showFollowing)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                showFollowing
                  ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-400"
                  : "border-theme-border text-theme-text-muted hover:text-theme-text-secondary"
              }`}
            >
              Following
            </button>
          )}
          <ModeSelector selected={mode} onSelect={handleModeChange} />
        </div>
      </div>

      {/* Active Competition Banner */}
      <CompetitionBanner />

      {mode === "activity" ? (
        // Activity Feed mode
        isConnected ? (
          <ActivityFeed
            onBrowseLeaderboard={() => handleModeChange("volume")}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-theme-bg-secondary rounded-lg border border-theme-border">
            <p className="text-theme-text-muted mb-2">
              Connect wallet to see your feed
            </p>
            <p className="text-xs text-theme-text-muted">
              Follow traders and see their recent activity here
            </p>
          </div>
        )
      ) : (
        <>
          {/* My Rank Card (only when connected, page 1) */}
          {isConnected && userAddress && page === 1 && (
            <MyRankCard address={userAddress} />
          )}

          {/* Stats Bar + Period/Scope Selector */}
          {mode === "score" ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <ScopeSelector
                  selected={viewMode}
                  onSelect={handleViewModeChange}
                  pastDisabled={pastWeeks.length === 0}
                />
                {viewMode === "past" && pastWeeks.length > 0 && (
                  <WeekPicker
                    weeks={pastWeeks}
                    selectedWeekId={selectedWeekId}
                    onChange={(wId) => {
                      setSelectedWeekId(wId);
                      setPage(1);
                    }}
                  />
                )}
                {activeData && activeData.updatedAt > 0 && (
                  <span className="text-sm text-theme-text-muted">
                    Updated{" "}
                    {new Date(activeData.updatedAt).toLocaleTimeString(
                      "en-US",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      },
                    )}
                  </span>
                )}
              </div>
              <LeaderboardSearchBox
                entries={cappedScoreTraders}
                filterFn={scoreFilterFn}
                toResult={scoreToResult}
                onSelect={handleSearchSelect}
                placeholder="Search by handle, name, or address..."
                disabled={scoreQuery.isLoading && cappedScoreTraders.length === 0}
              />
            </div>
          ) : (
            <div className="flex items-center justify-between">
              {activeData && activeData.totalTraders > 0 ? (
                <div className="flex items-center gap-4 text-sm text-theme-text-muted">
                  <span>{activeData.totalTraders} active traders</span>
                  <span>
                    Showing {offset + 1}-
                    {Math.min(
                      offset + PAGE_SIZE,
                      Math.min(totalTraders, MAX_RANK),
                    )}
                  </span>
                  {activeData.updatedAt > 0 && (
                    <span>
                      Updated{" "}
                      {new Date(activeData.updatedAt).toLocaleTimeString(
                        "en-US",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        },
                      )}
                    </span>
                  )}
                </div>
              ) : (
                <div />
              )}
              <PeriodSelector selected={period} onSelect={handlePeriodChange} />
            </div>
          )}

          {/* Leaderboard Table */}
          <div className="bg-theme-bg-secondary rounded-lg border border-theme-border overflow-hidden">
            {mode === "score" ? (
              (() => {
                if (showNoData) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-theme-text-muted">
                      <p className="text-sm">No data for this week</p>
                    </div>
                  );
                }
                const currentTraders = pagedScoreTraders;
                if (isNewWeek && allScoreTraders.length === 0) {
                  const prevWeekId = prevWeekQuery.data?.weekId;
                  const prevTraders = prevWeekQuery.data?.traders ?? [];
                  return (
                    <div>
                      <div className="flex flex-col items-center justify-center py-8 text-theme-text-secondary border-b border-theme-border">
                        <p className="text-sm font-medium">
                          Week just started. Leaderboard updates as traders are
                          active.
                        </p>
                      </div>
                      {(prevWeekQuery.isLoading || prevTraders.length > 0) && (
                        <div>
                          <div className="px-4 py-3 text-xs font-medium text-theme-text-muted uppercase tracking-wider border-b border-theme-border">
                            Last week{prevWeekId ? ` (${prevWeekId})` : ""}{" "}
                            final standings
                          </div>
                          <ScoreLeaderboardTable
                            traders={prevTraders}
                            isLoading={prevWeekQuery.isLoading}
                            currentUserAddress={userAddress}
                            followFilter={false}
                          />
                        </div>
                      )}
                    </div>
                  );
                }
                // Current week past the 2h "new week" grace window with no
                // traders at all almost always means the chat-server scoring
                // pipeline is mid-cycle or briefly unavailable, NOT that the
                // viewer has stopped trading. Showing "No score data yet /
                // Trade on any pool" misleads active players (a real example:
                // the current week's rank-1 trader saw this banner during a
                // chat-server aggregator stall). Surface the transient nature
                // explicitly so the user retries instead of doubting their
                // own activity.
                if (
                  isCurrentWeek &&
                  !isNewWeek &&
                  !showFollowing &&
                  allScoreTraders.length === 0
                ) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-theme-text-muted">
                      <p className="text-sm">Leaderboard data is temporarily unavailable.</p>
                      <p className="text-sm mt-1 opacity-70">Please refresh in a moment.</p>
                    </div>
                  );
                }
                return (
                  <ScoreLeaderboardTable
                    traders={showFollowing ? allScoreTraders : currentTraders}
                    isLoading={activeLoading}
                    currentUserAddress={userAddress}
                    followFilter={showFollowing}
                    highlightedAddress={highlightedId}
                  />
                );
              })()
            ) : mode === "pnl" ? (
              <PnlLeaderboardTable
                traders={pnlQuery.data?.traders ?? []}
                isLoading={activeLoading}
                currentUserAddress={userAddress}
                followFilter={showFollowing}
              />
            ) : (
              <LeaderboardTable
                traders={volumeQuery.data?.traders ?? []}
                isLoading={activeLoading}
                currentUserAddress={userAddress}
                followFilter={showFollowing}
              />
            )}

            {/* Pagination */}
            {!showFollowing && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            )}
          </div>

          {mode === "score" && activeData && activeData.totalTraders > 0 && (
            <div className="flex flex-wrap items-center gap-4 text-sm text-theme-text-muted">
              <span>{activeData.totalTraders} active traders</span>
              <span>
                Showing {offset + 1}-
                {Math.min(offset + PAGE_SIZE, Math.min(totalTraders, MAX_RANK))}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
