import { useTranslation } from "react-i18next";
import LeaderboardV3Row from "../LeaderboardV3Row";
import PaginationControlsV3 from "../PaginationControlsV3";
import type { SeasonLeaderboardResponse } from "../../types";

interface PaginationState {
  totalPages: number;
  pageInput: string;
  paginationRange: (number | string)[];
  handlePageInputChange: (value: string) => void;
}

interface LeaderboardMainContentProps {
  leaderboardData?: SeasonLeaderboardResponse;
  highlightedUsername?: string;
  page: number;
  pagination: PaginationState;
  handlePageChange: (page: number) => void;
  ITEMS_PER_PAGE: number;
}

export function LeaderboardMainContent({
  leaderboardData,
  highlightedUsername,
  page,
  pagination,
  handlePageChange,
  ITEMS_PER_PAGE,
}: LeaderboardMainContentProps) {
  const { t } = useTranslation("leaderboard");
  return (
    <div className="min-w-0 w-full">
        {leaderboardData && leaderboardData.entries.length > 0 && (
          <>
            <div className="w-full border border-nasun-nw3/30 bg-nasun-nw3/5 rounded-sm overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-nasun-nw3/20 border-b border-nasun-nw3/30">
                <span className="col-span-2 text-left font-semibold text-nasun-nw4 uppercase tracking-wide text-sm">
                  {t("v3.table.rank")}
                </span>
                <span className="col-span-6 text-left font-semibold text-nasun-nw4 uppercase tracking-wide text-sm relative group cursor-help">
                  {t("v3.table.user")}
                  <span className="invisible group-hover:visible absolute left-0 top-full mt-2 px-3 py-1.5 bg-nasun-nw3 text-nasun-white text-sm font-normal normal-case rounded-sm whitespace-nowrap z-10 border border-nasun-nw2/40">
                    <span className="text-nasun-c7">{t("v3.table.userTooltipGreen")}</span> &middot; <span className="text-sky-400">{t("v3.table.userTooltipBlue")}</span>
                  </span>
                </span>
                <span className="col-span-2 text-right font-semibold text-nasun-nw4 uppercase tracking-wide text-sm relative group cursor-help">
                  {t("v3.table.score")}
                  <span className="invisible group-hover:visible absolute right-0 top-full mt-2 px-3 py-1.5 bg-nasun-nw3 text-nasun-white text-sm font-normal normal-case rounded-sm whitespace-nowrap z-10 border border-nasun-nw2/40">
                    {t("v3.table.scoreTooltip")}
                  </span>
                </span>
                <span className="col-span-2 text-center font-semibold text-nasun-nw4 uppercase tracking-wide text-sm relative group cursor-help">
                  {t("v3.table.change")}
                  <span className="invisible group-hover:visible absolute right-0 top-full mt-2 px-3 py-1.5 bg-nasun-nw3 text-nasun-white text-sm font-normal normal-case rounded-sm whitespace-nowrap z-10 border border-nasun-nw2/40">
                    {t("v3.table.changeTooltip")}
                  </span>
                </span>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-nasun-nw3/20">
                {leaderboardData.entries.map((entry) => (
                  <LeaderboardV3Row
                    key={`${entry.platform}-${entry.username}`}
                    entry={entry}
                    isHighlighted={highlightedUsername === entry.username}
                  />
                ))}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-nasun-nw3/25 flex justify-between items-center bg-nasun-nw3/10">
                <span className="text-nasun-nw4 text-sm">
                  {t("v3.table.total", { count: leaderboardData.totalCount })}
                </span>
                <span className="text-nasun-nw4 text-sm">
                  {t("v3.table.lastUpdated", { date: new Date(leaderboardData.calculatedAt).toLocaleString("en-US") })}
                </span>
              </div>
            </div>

            {/* Pagination */}
            {leaderboardData.totalCount > ITEMS_PER_PAGE && (
              <div className="mt-5">
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
          <div className="text-center py-12 bg-nasun-nw3/5 rounded-sm border border-nasun-nw3/25">
            <p className="text-nasun-nw4">{t("v3.table.noEntries")}</p>
          </div>
        )}
      </div>
    );
}
