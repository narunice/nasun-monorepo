import { useTranslation } from "react-i18next";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SeasonSelector } from "./SeasonSelector";
import TopClimbersV3 from "./TopClimbersV3";
import { SnapshotViewerV3 } from "./SnapshotViewerV3";
import { UserSearchBoxV3 } from "./UserSearchBoxV3";
import { MyRankCardV3 } from "./sidebar/MyRank";
import { LeaderboardSidebar } from "./sidebar/LeaderboardSidebar";
import { LeaderboardMainContent } from "./main/LeaderboardMainContent";
import { useLeaderboardState } from "../hooks/useLeaderboardState";
import { Spinner } from "@/components/ui";

const ITEMS_PER_PAGE = 50;

export function LeaderboardV3() {
  const { t } = useTranslation("leaderboard");
  const {
    seasons,
    seasonsLoading,
    selectedSeasonId,
    selectedSeason,
    isSeasonEnded,
    snapshotDate,
    setSnapshotDate,
    handleSeasonChange,
    leaderboardData,
    leaderboardLoading,
    leaderboardError,
    page,
    pagination,
    handlePageChange,
    highlightedUsername,
    handleUserSelect,
  } = useLeaderboardState();

  return (
    <SectionLayout className="!max-w-7xl px-auto">
      {/* Header */}
      <PageTitle as="h2" align="center">
        {t("v3.title")}
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

      {/* Loading State */}
      {leaderboardLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" colorClass="text-white/50" />
        </div>
      )}

      {/* Error State */}
      {leaderboardError && (
        <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-sm text-red-400 text-sm text-center">
          {t("v3.loadError")}
        </div>
      )}

      {/* No Active Season */}
      {!seasonsLoading && (!seasons || seasons.length === 0) && (
        <div className="text-center py-12">
          <p className="text-nasun-white/50 text-lg">{t("v3.noSeason")}</p>
        </div>
      )}

      {/* Mobile: My Rank Card above table */}
      {selectedSeasonId && (
        <div className="md:hidden mb-6">
          <MyRankCardV3 seasonId={selectedSeasonId} />
        </div>
      )}

      {/* 2-column grid: column widths shared across rows */}
      {selectedSeasonId && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] lg:grid-cols-[1fr_380px] gap-x-8 gap-y-3">
          {/* Row 1, Col 1: Snapshot Viewer */}
          <div>
            {selectedSeason && (
              <SnapshotViewerV3
                selectedDate={snapshotDate}
                onDateChange={setSnapshotDate}
                minDate={selectedSeason.startDate}
                maxDate={isSeasonEnded ? selectedSeason.endDate : new Date().toISOString().split('T')[0]}
                lastUpdated={leaderboardData?.calculatedAt}
                isEnded={isSeasonEnded}
              />
            )}
          </div>

          {/* Row 1, Col 2: Search */}
          <div>
            <UserSearchBoxV3
              seasonId={selectedSeasonId}
              onUserSelect={handleUserSelect}
              placeholder={t("v3.searchPlaceholder")}
            />
          </div>

          {/* Row 2, Col 1: Leaderboard Table */}
          <LeaderboardMainContent
            leaderboardData={leaderboardData}
            highlightedUsername={highlightedUsername}
            page={page}
            pagination={pagination}
            handlePageChange={handlePageChange}
            ITEMS_PER_PAGE={ITEMS_PER_PAGE}
          />

          {/* Row 2, Col 2: Sidebar (My Rank + Feed) */}
          <LeaderboardSidebar seasonId={selectedSeasonId} />
        </div>
      )}
    </SectionLayout>
  );
}
