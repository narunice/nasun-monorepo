import { TotalPointsCard } from "./TotalPointsCard";
import { HealthGaugeCard } from "./HealthGaugeCard";
import { ActivatedAppsSection } from "./ActivatedAppsSection";
import { WalletBalanceCard } from "./WalletBalanceCard";
import { StakingCard } from "./StakingCard";
import { BannerCarousel } from "./banner/BannerCarousel";
import { UjuDailyMissionsCard } from "./UjuDailyMissionsCard";
import { UjuNftShowcaseCard } from "./UjuNftShowcaseCard";
import { useAppDirectory } from "../apps/useAppDirectory";
import { useAuth } from "@/features/auth";

export function DashboardTab() {
  const { user } = useAuth();
  const { pinnedApps, isPinned, pin, unpin, atMax } = useAppDirectory(user?.identityId);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      <div className="md:col-span-2 lg:col-span-3">
        <BannerCarousel />
      </div>

      {/* Top row: points hero + health gauge + missions split.
          On lg, points spans 2 columns to emphasize hero metric. */}
      <div className="md:col-span-2 lg:col-span-2">
        <TotalPointsCard />
      </div>
      <HealthGaugeCard />

      <div className="md:col-span-2 lg:col-span-3">
        <UjuDailyMissionsCard pinnedApps={pinnedApps} />
      </div>

      <ActivatedAppsSection pinnedApps={pinnedApps} isPinned={isPinned} pin={pin} unpin={unpin} atMax={atMax} />
      <WalletBalanceCard />
      <StakingCard />

      <div className="md:col-span-2 lg:col-span-3">
        <UjuNftShowcaseCard />
      </div>
    </div>
  );
}
