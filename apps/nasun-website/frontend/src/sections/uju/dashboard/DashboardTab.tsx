import { TotalPointsCard } from "./TotalPointsCard";
import { UserInfoCard } from "./UserInfoCard";
import { HealthGaugeCard } from "./HealthGaugeCard";
import { ActivatedAppsSection } from "./ActivatedAppsSection";
import { WalletBalanceCard } from "./WalletBalanceCard";
import { StakingCard } from "./StakingCard";
import { UjuDailyMissionsCard } from "./UjuDailyMissionsCard";
import { UjuNftShowcaseCard } from "./UjuNftShowcaseCard";
import { NewsEventsCard } from "./NewsEventsCard";
import { UjuSectionHeader } from "../shared";
import { useUjuAppDirectory } from "../apps/UjuAppDirectoryProvider";

interface DashboardTabProps {
  /** When true, render only the main grid (without the NFTs Activated section). */
  excludeNfts?: boolean;
}

export function DashboardTab({ excludeNfts = false }: DashboardTabProps = {}) {
  const directory = useUjuAppDirectory();
  const { pinnedApps } = directory;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
      <div className="flex flex-col gap-4 sm:gap-5 min-h-[260px]">
        <div className="flex-[1] min-h-0">
          <UserInfoCard />
        </div>
        <div className="flex-[2] min-h-0">
          <TotalPointsCard />
        </div>
      </div>
      <HealthGaugeCard />

      <div className="md:col-span-2">
        <NewsEventsCard />
      </div>

      <div className="md:col-span-2" data-uju-anchor="daily-missions">
        <UjuDailyMissionsCard
          pinnedApps={pinnedApps}
          missionsByApp={directory.state.missions}
        />
      </div>

      <div className="md:col-span-2">
        <ActivatedAppsSection directory={directory} />
      </div>

      <div className="md:col-span-2">
        <WalletBalanceCard />
      </div>

      <div className="md:col-span-2">
        <StakingCard />
      </div>

      {!excludeNfts && (
        <div className="md:col-span-2">
          <UjuSectionHeader accent title="NFTs Activated" />
          <UjuNftShowcaseCard />
        </div>
      )}
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
