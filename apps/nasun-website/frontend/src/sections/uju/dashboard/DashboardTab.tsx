import { ReactNode } from "react";
import { OverviewSummaryCard } from "./OverviewSummaryCard";
import { ActivatedAppsSection } from "./ActivatedAppsSection";
import { WalletBalanceCard } from "./WalletBalanceCard";
import { StakingCard } from "./StakingCard";
import { UjuDailyMissionsCard } from "./UjuDailyMissionsCard";
import { UjuNftShowcaseCard } from "./UjuNftShowcaseCard";
import { NewsEventsCard } from "./NewsEventsCard";
import { UjuSectionHeader } from "../shared";
import { useUjuAppDirectory } from "../apps/UjuAppDirectoryProvider";
import { UjuFeedCarousel } from "./feed/UjuFeedCarousel";

// Top portion: rendered full-width across the dashboard. The Overview card
// (profile + points + health) is the most important hero section and must
// span the entire container.
export function DashboardTabTop() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5">
      <OverviewSummaryCard />
    </div>
  );
}

interface DashboardTabBottomProps {
  /** Optional chat panel to render to the right of Active Engagement on desktop. */
  chatSlot?: ReactNode;
}

// Bottom portion: rendered at full container width.
//   Row 1: News/Events/Msgs (left) + Feed carousel (right, desktop only)
//   Row 2: Active Engagement (left) + Chat panel (right, desktop only)
//   Row 3+: Activated apps, wallet balance, staking
//
// News+Feed sit directly under Overview so the celebration carousel is the
// first thing users see (and the natural target for screenshots).
export function DashboardTabBottom({ chatSlot }: DashboardTabBottomProps = {}) {
  const directory = useUjuAppDirectory();
  const { pinnedApps } = directory;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Row 1: News/Events + Feed (lifted above Daily Missions) */}
      <div data-uju-anchor="news-events" className="flex gap-4 sm:gap-5 items-stretch">
        <div className="flex-1 min-w-0">
          <NewsEventsCard />
        </div>
        <div className="w-[320px] shrink-0 hidden md:block">
          <UjuFeedCarousel />
        </div>
      </div>

      {/* Row 2: Active Engagement + Chat. Chat is absolutely positioned
          inside its column so it takes the row's stretch height (driven by
          Daily Missions on the left) instead of growing the row itself. */}
      <div data-uju-anchor="daily-missions" role="region" aria-label="Daily missions" className="flex gap-4 sm:gap-5 items-stretch">
        <div className="flex-1 min-w-0">
          <UjuDailyMissionsCard
            pinnedApps={pinnedApps}
            missionsByApp={directory.state.missions}
          />
        </div>
        {chatSlot && (
          <div className="w-[320px] shrink-0 hidden md:block relative">
            <div className="absolute inset-0">
              {chatSlot}
            </div>
          </div>
        )}
      </div>

      <ActivatedAppsSection directory={directory} />
      <WalletBalanceCard />
      <StakingCard />
    </div>
  );
}

// Combined: stacks Top + Bottom. The NFT showcase is always rendered
// separately by UjuPage (after the dashboard body) so it's not part of
// either Top or Bottom.
interface DashboardTabProps {
  chatSlot?: ReactNode;
}

export function DashboardTab({ chatSlot }: DashboardTabProps = {}) {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <DashboardTabTop />
      <DashboardTabBottom chatSlot={chatSlot} />
    </div>
  );
}

export function DashboardNftsSection() {
  return (
    <>
      <UjuSectionHeader accent title="NFTs Activated" />
      <UjuNftShowcaseCard />
    </>
  );
}
