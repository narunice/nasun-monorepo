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

// Top portion: rendered inside the flex container alongside the chat panel.
export function DashboardTabTop() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-5">
      <OverviewSummaryCard />
      <div data-uju-anchor="news-events">
        <NewsEventsCard />
      </div>
    </div>
  );
}

// Bottom portion: rendered at full container width, below the chat panel.
// Daily Missions and Feed sit side-by-side on desktop; remaining cards stack below.
export function DashboardTabBottom() {
  const directory = useUjuAppDirectory();
  const { pinnedApps } = directory;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div data-uju-anchor="daily-missions" className="flex gap-4 sm:gap-5 items-stretch">
        <div className="flex-1 min-w-0">
          <UjuDailyMissionsCard
            pinnedApps={pinnedApps}
            missionsByApp={directory.state.missions}
          />
        </div>
        <div className="w-[320px] shrink-0 hidden md:block">
          <UjuFeedCarousel />
        </div>
      </div>
      <ActivatedAppsSection directory={directory} />
      <WalletBalanceCard />
      <StakingCard />
    </div>
  );
}

// Combined: used when chat is closed (no split needed). Internally just
// stacks Top + Bottom so the section list lives in exactly one place. The
// NFT showcase is always rendered separately by UjuPage (after the
// dashboard body) so it's not part of either Top or Bottom.
export function DashboardTab() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <DashboardTabTop />
      <DashboardTabBottom />
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
