/**
 * Leaderboard V3 Public Component
 *
 * Displays the community engagement leaderboard with:
 * - Season selector
 * - Top Climbers spotlight
 * - Rank change indicators
 * - Snapshot date picker for past rankings
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { useSeasons, useActiveSeason } from "../hooks/useSeasons";
import { useSeasonLeaderboard } from "../hooks/useSeasonLeaderboard";
import { usePaginationV3 } from "../hooks/usePaginationV3";
import { SeasonSelector } from "./SeasonSelector";
import TopClimbersV3 from "./TopClimbersV3";
import LeaderboardV3Row from "./LeaderboardV3Row";
import { SnapshotViewerV3 } from "./SnapshotViewerV3";
import { UserSearchBoxV3 } from "./UserSearchBoxV3";
import PaginationControlsV3 from "./PaginationControlsV3";
import { NasunContentFeed } from "./NasunContentFeed";

const ITEMS_PER_PAGE = 50;

export function LeaderboardV3() {
  const { data: seasons, isLoading: seasonsLoading } = useSeasons();
  const activeSeason = useActiveSeason();

  // Selected season (defaults to active season)
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | undefined>(undefined);

  // Snapshot date for past rankings (optional)
  const [snapshotDate, setSnapshotDate] = useState<string | undefined>(undefined);

  // Page state for query
  const [page, setPage] = useState(1);

  // Fetch leaderboard data
  const {
    data: leaderboardData,
    isLoading: leaderboardLoading,
    error: leaderboardError,
  } = useSeasonLeaderboard({
    seasonId: selectedSeasonId,
    snapshotDate,
    limit: ITEMS_PER_PAGE,
    offset: (page - 1) * ITEMS_PER_PAGE,
  });

  // Pagination hook for UI (uses totalCount from query)
  const pagination = usePaginationV3(leaderboardData?.totalCount ?? 0, ITEMS_PER_PAGE);

  // Highlighted user for search
  const [highlightedUsername, setHighlightedUsername] = useState<string | undefined>(undefined);
  const [pendingScrollUsername, setPendingScrollUsername] = useState<string | undefined>(undefined);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tableRef = useRef<HTMLDivElement>(null);

  // Handle user search selection
  const handleUserSelect = useCallback(
    (username: string, rank?: number) => {
      // Clear any existing timeout
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }

      setHighlightedUsername(username);

      // Calculate target page from rank
      if (rank) {
        const targetPage = Math.ceil(rank / ITEMS_PER_PAGE);
        if (targetPage !== page) {
          // Need to change page first, then scroll after data loads
          setPendingScrollUsername(username);
          setPage(targetPage);
          pagination.handlePageChange(targetPage);
        } else {
          // Same page, scroll immediately
          setTimeout(() => {
            const row = document.querySelector(`[data-username="${username}"]`);
            if (row) {
              row.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 100);
        }
      } else {
        // No rank info, try to scroll on current page
        setTimeout(() => {
          const row = document.querySelector(`[data-username="${username}"]`);
          if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 100);
      }

      // Auto-clear highlight after 6 seconds
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedUsername(undefined);
      }, 6000);
    },
    [page, pagination],
  );

  // Scroll to user after page change completes
  useEffect(() => {
    if (pendingScrollUsername && !leaderboardLoading) {
      // Data loaded, now scroll to the user
      setTimeout(() => {
        const row = document.querySelector(`[data-username="${pendingScrollUsername}"]`);
        if (row) {
          row.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        setPendingScrollUsername(undefined);
      }, 100);
    }
  }, [pendingScrollUsername, leaderboardLoading]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Set default season when data loads
  useEffect(() => {
    if (activeSeason && !selectedSeasonId) {
      setSelectedSeasonId(activeSeason.seasonId);
    }
  }, [activeSeason, selectedSeasonId]);

  // Handle page change - update local page state
  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage < 1 || newPage > pagination.totalPages || newPage === page) {
        return;
      }
      setPage(newPage);
      pagination.handlePageInputChange(newPage.toString());
    },
    [page, pagination],
  );

  // Reset page when season or snapshot changes
  useEffect(() => {
    setPage(1);
    pagination.resetToFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeasonId, snapshotDate]);

  // Get selected season info
  const selectedSeason = seasons?.find((s) => s.seasonId === selectedSeasonId);
  const isSeasonEnded = selectedSeason?.status === "ended" || selectedSeason?.status === "archived";

  // Handle season change
  const handleSeasonChange = (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    setSnapshotDate(undefined); // Reset snapshot date when changing seasons
  };

  return (
    <SectionLayout className="!max-w-7xl px-auto">
      {/* Header - V2 style */}
      <PageTitle as="h2" align="center">
        Community Leaderboard
      </PageTitle>

      {/* Season Selector */}
      {seasons && seasons.length > 0 && (
        <div className="mb-8">
          <SeasonSelector
            seasons={seasons}
            selectedSeasonId={selectedSeasonId}
            onSelect={handleSeasonChange}
            isLoading={seasonsLoading}
            selectedSeason={selectedSeason}
          />
        </div>
      )}

      {/* Top Climbers Spotlight */}
      {selectedSeasonId && (
        <div className="mb-8">
          <TopClimbersV3 seasonId={selectedSeasonId} />
        </div>
      )}

      {/* Snapshot Viewer and Search */}
      {selectedSeason && (
        <div className="mb-3 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
          <SnapshotViewerV3
            selectedDate={snapshotDate}
            onDateChange={setSnapshotDate}
            minDate={selectedSeason.startDate}
            maxDate={selectedSeason.endDate}
            lastUpdated={leaderboardData?.calculatedAt}
            isEnded={isSeasonEnded}
          />
          <UserSearchBoxV3
            seasonId={selectedSeasonId}
            onUserSelect={handleUserSelect}
            placeholder="Search user..."
          />
        </div>
      )}

      {/* Loading State */}
      {leaderboardLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nasun-c3"></div>
        </div>
      )}

      {/* Error State */}
      {leaderboardError && (
        <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-sm text-red-400 text-sm text-center">
          Failed to load leaderboard. Please try again later.
        </div>
      )}

      {/* No Active Season */}
      {!seasonsLoading && (!seasons || seasons.length === 0) && (
        <div className="text-center py-12">
          <p className="text-nasun-white/50 text-lg">No active season at the moment.</p>
        </div>
      )}

      {/* Main Content Area - 2 Column Layout */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Left Column: Leaderboard Table */}
        <div className="flex-1 min-w-0 w-full">
          {leaderboardData && leaderboardData.entries.length > 0 && (
            <>
              <div className="w-full border border-nasun-c3/50 bg-gray-900/70 rounded-sm overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-nasun-c3/20">
                  <span className="col-span-2 text-left font-medium text-nasun-white uppercase">
                    RANK
                  </span>
                  <span className="col-span-6 text-left font-medium text-nasun-white uppercase">
                    USER
                  </span>
                  <span className="col-span-2 text-right font-medium text-nasun-white uppercase">
                    SCORE
                  </span>
                  <span className="col-span-2 text-center font-medium text-nasun-white uppercase">
                    CHANGE
                  </span>
                </div>

                {/* Table Body */}
                <div ref={tableRef} className="divide-y divide-gray-700">
                  {leaderboardData.entries.map((entry) => (
                    <LeaderboardV3Row
                      key={`${entry.platform}-${entry.username}`}
                      entry={entry}
                      isHighlighted={highlightedUsername === entry.username}
                    />
                  ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-gray-600 flex justify-between items-center">
                  <span className="text-gray-500">
                    Total: {leaderboardData.totalCount} contributors
                  </span>
                  <span className="text-gray-500">
                    {snapshotDate ? `Snapshot: ${snapshotDate}` : "Live"} |{" "}
                    {new Date(leaderboardData.calculatedAt).toLocaleString("en-US")}
                  </span>
                </div>
              </div>

              {/* Pagination */}
              {leaderboardData.totalCount > ITEMS_PER_PAGE && (
                <div className="mt-6">
                  <PaginationControlsV3
                    currentPage={page}
                    totalPages={pagination.totalPages}
                    totalEntries={leaderboardData.totalCount}
                    pageInput={pagination.pageInput}
                    paginationRange={pagination.paginationRange}
                    hasPrev={page > 1}
                    hasNext={page < pagination.totalPages}
                    onPageChange={handlePageChange}
                    onPageInputChange={pagination.handlePageInputChange}
                    onPageInputSubmit={(e) => {
                      e.preventDefault();
                      const pageNum = parseInt(pagination.pageInput, 10);
                      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pagination.totalPages) {
                        handlePageChange(pageNum);
                      }
                    }}
                  />
                </div>
              )}
            </>
          )}

          {/* Empty State */}
          {leaderboardData && leaderboardData.entries.length === 0 && (
            <div className="text-center py-12 bg-black/90 rounded-sm border border-gray-600">
              <p className="text-gray-100">No entries found for this season.</p>
            </div>
          )}
        </div>

        {/* Right Column: Featured Content Feed */}
        <div className="w-full lg:w-[320px] xl:w-[380px] lg:flex-shrink-0">
          <div className="lg:sticky lg:top-24">
            <NasunContentFeed seasonId={selectedSeasonId} />
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}
