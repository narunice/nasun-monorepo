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

      {/* Important Update Notice */}
      <div className="mb-10 p-6 md:p-8 bg-nasun-white/[0.04] border border-nasun-white/[0.1] rounded-sm">
        <h3 className="text-xl md:text-2xl font-semibold text-nasun-white mb-6">
          An Important Update on the Creators Leaderboard
        </h3>

        <div className="space-y-4 text-nasun-white/80 leading-relaxed text-sm md:text-base">
          <p>
            We are going to be direct with you, because you deserve nothing less.
          </p>
          <p>
            We are pausing the leaderboard indefinitely, effective today, 4 weeks after it launched on March 11. We have taken a snapshot of current rankings. This snapshot stands, and once we get funding, the top 200 creators on it will be rewarded. We are committed to this, and we will provide updates on our progress toward making it happen.
          </p>

          <h4 className="text-lg font-semibold text-nasun-white pt-2">What happened</h4>
          <p>
            We originally planned an 8 to 10 week leaderboard with a marketing budget. That was the basis for the number we put in front of you when we announced "Up to $25000."
          </p>
          <p>
            The main issue was we did not budget correctly for how much this launch would drain our resources as things quickly went over budget. There were many unforeseen causes but the biggest was how the leaderboard consumed all our time and energy.
          </p>

          <h4 className="text-lg font-semibold text-nasun-white pt-2">The reality of building this leaderboard</h4>
          <p>
            When X banned API-based InfoFi campaigns, we scrapped our original system and rebuilt everything based on manually-collected post data. Early on we used X Pro search, but quickly realized too many posts were being missed. So we switched to visiting the X profile of every single registered user, one by one, to collect posts to be as fair as possible. That list grew to 1,500 accounts.
          </p>
          <p>
            What started as a leaderboard became our entire operation. Founders became data collectors and a customer support center for complaints. No time for product development or anything else. We should have seen this coming. We did not. We thought there would be less interest because of the current market, but with less projects launching many creators discovered us.
          </p>

          <h4 className="text-lg font-semibold text-nasun-white pt-2">Another unforeseen event</h4>
          <p>
            Two weeks ago, one of our main workstations died on us right in the middle of our launch. We had a PC specialist visit, and they needed to take it for a week. We chose to get a new workstation and lost 5 days of work on that station.
          </p>
          <p>
            Then today, the Genesis Pass mint came in far below what we had expected.
          </p>
          <p>
            We also want to be honest about something else. As a self-funded two-person team, we were not adequately prepared for this kind of disruption. And launching a membership NFT with optimism in this market was, in hindsight, overly bold no matter how confident we were of our products.
          </p>

          <h4 className="text-lg font-semibold text-nasun-white pt-2">What we are proud of</h4>
          <p>
            In spite of all of this, we are genuinely proud of what this leaderboard produced. We have reviewed other project campaigns. The content is often templated graphics and generic copy. What Nasun creators made was something different. Original media, real insight, genuine personality. That happened because we reviewed every post ourselves and built a system that rewarded quality, not just volume. It gave mid-sized and emerging creators a fair shot alongside established accounts, and we believe it showed.
          </p>

          <h4 className="text-lg font-semibold text-nasun-white pt-2">Why we are still building</h4>
          <p>
            We came into Web3 because we believed it was the right technology to make community-owned ecosystems real. We self-funded for over three years. Two of those years full-time on Nasun, because we didn't want the top-down structure with initial VC money but the bottom-up model from community first to institution next. The bear market has shown us that vision alone cannot cover servers, infrastructure, and the people needed to build.
          </p>
          <p>
            We are not walking away. We are pursuing investment so we can build with the stability this project deserves. We will not abandon what we have built for three years and what we built with the community for a month, and we will not abandon the creators who believed in us early.
          </p>
          <p>
            The snapshot is locked. The commitment stands. We will take the criticism in the meantime, and we will earn back what trust we can.
          </p>
          <p>
            We will keep shipping products that we've built while making an effort to find institutional partnership.
          </p>
          <p>
            Those top 200 creators, we apologize and we will do our best to earn your trust back.
          </p>
          <p>
            We will create a point pool for the top 500 creators. Your account page will be updated to reflect this by this weekend.
          </p>
          <p>
            So far 340 have minted the Genesis Pass, if you want a refund, please dm. We, however, will continue with the scheduled airdrop.
          </p>
          <p>
            Those who understand us and decide to support Nasun despite this disappointment, we truly appreciate your support. We are devastated that years of hard work has come to this, but we will keep building and shipping products. To prove this, we worked hard this week to release the public beta of Pado and the first ecosystem leaderboard. Next is Prediction markets where we hope the community will help us shape it.
          </p>
          <p className="text-nasun-white/60 italic pt-2">
            - Nasun team
          </p>
        </div>
      </div>

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
