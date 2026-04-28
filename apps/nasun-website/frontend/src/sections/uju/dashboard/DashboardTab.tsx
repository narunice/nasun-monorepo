import { TotalPointsCard } from "./TotalPointsCard";
import { HealthGaugeCard } from "./HealthGaugeCard";
import { ActivatedAppsSection } from "./ActivatedAppsSection";
import { WalletBalanceCard } from "./WalletBalanceCard";
import { StakingCard } from "./StakingCard";
import { UjuDailyMissionsCard } from "./UjuDailyMissionsCard";
import { UjuNftShowcaseCard } from "./UjuNftShowcaseCard";
import { NewsEventsCard } from "./NewsEventsCard";
import { UjuSectionHeader } from "../shared";
import { useAppDirectory } from "../apps/useAppDirectory";
import { useAuth } from "@/features/auth";

export function DashboardTab() {
  const { user } = useAuth();
  const { pinnedApps, isPinned, pin, unpin, atMax } = useAppDirectory(user?.identityId);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      {/* Row 1: Nasun Points (2 cols on lg) + Health gauge */}
      <div className="md:col-span-2 lg:col-span-2">
        <TotalPointsCard />
      </div>
      <HealthGaugeCard />

      {/* Row 2: News, Events, and Msgs */}
      <div className="md:col-span-2 lg:col-span-3">
        <NewsEventsCard />
      </div>

      {/* Row 3: Daily Missions */}
      <div className="md:col-span-2 lg:col-span-3">
        <UjuDailyMissionsCard pinnedApps={pinnedApps} />
      </div>

      {/* Row 4: Activated Apps, Services, and AI */}
      <div className="md:col-span-2 lg:col-span-3">
        <ActivatedAppsSection
          pinnedApps={pinnedApps}
          isPinned={isPinned}
          pin={pin}
          unpin={unpin}
          atMax={atMax}
        />
      </div>

      {/* Row 5: Wallet Integration */}
      <div className="md:col-span-2 lg:col-span-3">
        <WalletBalanceCard />
      </div>

      {/* Row 6: Base Staking & Apps Staking */}
      <div className="md:col-span-2 lg:col-span-3">
        <StakingCard />
      </div>

      {/* Row 7: NFTs Activated */}
      <div className="md:col-span-2 lg:col-span-3">
        <UjuSectionHeader accent title="NFTs Activated" />
        <UjuNftShowcaseCard />
      </div>
    </div>
  );
}
