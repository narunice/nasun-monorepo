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

interface DashboardTabProps {
  /** When true, render only the main grid (without the NFTs Activated section). */
  excludeNfts?: boolean;
}

export function DashboardTab({ excludeNfts = false }: DashboardTabProps = {}) {
  const { user } = useAuth();
  const { pinnedApps, isPinned, pin, unpin, atMax } = useAppDirectory(user?.identityId);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      <div className="md:col-span-2 lg:col-span-2">
        <TotalPointsCard />
      </div>
      <HealthGaugeCard />

      <div className="md:col-span-2 lg:col-span-3">
        <NewsEventsCard />
      </div>

      <div className="md:col-span-2 lg:col-span-3" data-uju-anchor="daily-missions">
        <UjuDailyMissionsCard pinnedApps={pinnedApps} />
      </div>

      <div className="md:col-span-2 lg:col-span-3">
        <ActivatedAppsSection
          pinnedApps={pinnedApps}
          isPinned={isPinned}
          pin={pin}
          unpin={unpin}
          atMax={atMax}
        />
      </div>

      <div className="md:col-span-2 lg:col-span-3">
        <WalletBalanceCard />
      </div>

      <div className="md:col-span-2 lg:col-span-3">
        <StakingCard />
      </div>

      {!excludeNfts && (
        <div className="md:col-span-2 lg:col-span-3">
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
