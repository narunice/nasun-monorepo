import { TotalPointsCard } from "./TotalPointsCard";
import { HealthGaugeCard } from "./HealthGaugeCard";
import { ActivatedAppsSection } from "./ActivatedAppsSection";
import { WalletBalanceCard } from "./WalletBalanceCard";
import { StakingCard } from "./StakingCard";
import { BannerCarousel } from "./banner/BannerCarousel";
import { UjuDailyMissionsCard } from "./UjuDailyMissionsCard";
import { NftShowcaseCard } from "@/sections/myAccount/NftShowcaseCard";
import { useAppDirectory } from "../apps/useAppDirectory";

export function DashboardTab() {
  // Single useAppDirectory instance — pinnedApps passed down to avoid dual instantiation
  const { pinnedApps, isPinned, pin, unpin, atMax } = useAppDirectory();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <BannerCarousel />
      </div>
      <TotalPointsCard />
      <HealthGaugeCard />
      <div className="md:col-span-2">
        <UjuDailyMissionsCard pinnedApps={pinnedApps} />
      </div>
      <ActivatedAppsSection pinnedApps={pinnedApps} isPinned={isPinned} pin={pin} unpin={unpin} atMax={atMax} />
      <WalletBalanceCard />
      <StakingCard />
      <div className="md:col-span-2">
        <NftShowcaseCard />
      </div>
    </div>
  );
}
