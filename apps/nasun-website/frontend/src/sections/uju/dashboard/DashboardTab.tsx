import { TotalPointsCard } from "./TotalPointsCard";
import { HealthGaugeCard } from "./HealthGaugeCard";
import { ActivatedAppsSection } from "./ActivatedAppsSection";
import { WalletBalanceCard } from "./WalletBalanceCard";
import { StakingCard } from "./StakingCard";
import { DailyMissionsCard } from "@/sections/myAccount/DailyMissionsCard";
import { NftShowcaseCard } from "@/sections/myAccount/NftShowcaseCard";

export function DashboardTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <TotalPointsCard />
      <HealthGaugeCard />
      <div className="md:col-span-2">
        <DailyMissionsCard />
      </div>
      <ActivatedAppsSection />
      <WalletBalanceCard />
      <StakingCard />
      <div className="md:col-span-2">
        <NftShowcaseCard />
      </div>
    </div>
  );
}
