import { PageTitle } from "@/components/ui/PageTitle";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SeasonSelector } from "./SeasonSelector";
import TopClimbersV3 from "./TopClimbersV3";
import { MyRankCardV3 } from "./sidebar/MyRank";
import { LeaderboardSidebar } from "./sidebar/LeaderboardSidebar";
import { LeaderboardMainContent } from "./main/LeaderboardMainContent";
import { useLeaderboardState } from "../hooks/useLeaderboardState";
import { useStickySidebar } from "../hooks/useStickySidebar";

const ITEMS_PER_PAGE = 50;

export function LeaderboardV3() {
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

  const { rightColumnRef } = useStickySidebar();

  return (
    <SectionLayout className="!max-w-7xl px-auto">
      {/* Header */}
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

      {/* Loading State */}
      {leaderboardLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-nasun-c3/50"></div>
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

      {/* Mobile: My Rank Card above table */}
      {selectedSeasonId && (
        <div className="md:hidden mb-6">
          <MyRankCardV3 seasonId={selectedSeasonId} />
        </div>
      )}

      {/* Main Content Area - 2 Column Layout */}
      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Left Column: Sidebar (Search + My Rank + Feed) */}
        <div className="w-full md:flex-1 lg:flex-none lg:w-[380px]">
          <LeaderboardSidebar
            seasonId={selectedSeasonId}
            onUserSelect={handleUserSelect}
          />
        </div>

        {/* Right Column: Leaderboard Table */}
        <LeaderboardMainContent
          ref={rightColumnRef}
          leaderboardData={leaderboardData}
          selectedSeason={selectedSeason}
          snapshotDate={snapshotDate}
          onSnapshotDateChange={setSnapshotDate}
          isSeasonEnded={isSeasonEnded}
          highlightedUsername={highlightedUsername}
          page={page}
          pagination={pagination}
          handlePageChange={handlePageChange}
          ITEMS_PER_PAGE={ITEMS_PER_PAGE}
        />
      </div>
    </SectionLayout>
  );
}