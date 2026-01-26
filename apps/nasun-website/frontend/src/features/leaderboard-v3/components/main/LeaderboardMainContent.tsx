import { forwardRef } from "react";
import { SnapshotViewerV3 } from "../SnapshotViewerV3";
import LeaderboardV3Row from "../LeaderboardV3Row";
import PaginationControlsV3 from "../PaginationControlsV3";
import type { SeasonLeaderboardResponse, Season } from "../../types";

interface PaginationState {
  totalPages: number;
  pageInput: string;
  paginationRange: (number | string)[];
  handlePageInputChange: (value: string) => void;
}

interface LeaderboardMainContentProps {
  leaderboardData?: SeasonLeaderboardResponse;
  selectedSeason?: Season;
  snapshotDate?: string;
  onSnapshotDateChange: (date: string | undefined) => void;
  isSeasonEnded?: boolean;
  highlightedUsername?: string;
  page: number;
  pagination: PaginationState;
  handlePageChange: (page: number) => void;
  ITEMS_PER_PAGE: number;
}

export const LeaderboardMainContent = forwardRef<HTMLDivElement, LeaderboardMainContentProps>(
  (
    {
      leaderboardData,
      selectedSeason,
      snapshotDate,
      onSnapshotDateChange,
      isSeasonEnded,
      highlightedUsername,
      page,
      pagination,
      handlePageChange,
      ITEMS_PER_PAGE,
    },
    ref,
  ) => {
    return (
      <div ref={ref} className="flex-1 min-w-0 w-full ">
        {/* Snapshot Viewer */}
        {selectedSeason && (
          <div className="mb-3">
            <SnapshotViewerV3
              selectedDate={snapshotDate}
              onDateChange={onSnapshotDateChange}
              minDate={selectedSeason.startDate}
              maxDate={selectedSeason.endDate}
              lastUpdated={leaderboardData?.calculatedAt}
              isEnded={isSeasonEnded}
            />
          </div>
        )}

        {leaderboardData && leaderboardData.entries.length > 0 && (
          <>
            <div className="w-full border border-nasun-c7/50 bg-gray-900/70 rounded-sm overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-nasun-c7/20">
                <span className="col-span-2 text-left font-medium text-nasun-white uppercase">
                  RANK
                </span>
                <span className="col-span-6 text-left font-medium text-nasun-white uppercase relative group cursor-help">
                  USER
                  <span className="invisible group-hover:visible absolute left-0 top-full mt-2 px-2 py-1 bg-gray-800 text-gray-200 text-xs font-normal normal-case rounded whitespace-nowrap z-10">
                    Checkmark indicates a community member signed up on Nasun Website
                  </span>
                </span>
                <span className="col-span-2 text-right font-medium text-nasun-white uppercase relative group cursor-help">
                  SCORE
                  <span className="invisible group-hover:visible absolute right-0 top-full mt-2 px-2 py-1 bg-gray-800 text-gray-200 text-xs font-normal normal-case rounded whitespace-nowrap z-10">
                    Score may decay over time
                  </span>
                </span>
                <span className="col-span-2 text-center font-medium text-nasun-white uppercase relative group cursor-help">
                  CHANGE
                  <span className="invisible group-hover:visible absolute right-0 top-full mt-2 px-2 py-1 bg-gray-800 text-gray-200 text-xs font-normal normal-case rounded whitespace-nowrap z-10">
                    Rank change compared to yesterday's snapshot
                  </span>
                </span>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-700">
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
    );
  },
);

LeaderboardMainContent.displayName = "LeaderboardMainContent";
