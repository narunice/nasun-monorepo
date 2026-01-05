import { Suspense, lazy } from "react";
import { PageLayout } from "../../../components/layout/PageLayout";
import ErrorBoundary from "../../../components/layout/ErrorBoundary";

// Lazy load section components
const CommunityEngagementSection = lazy(
  () => import("../../../components/app/ips/spectra/CommunityEngagementSection")
);
const SpectraOverviewSection = lazy(
  () => import("../../../components/app/ips/spectra/SpectraOverviewSection")
);
const GameDescriptionSection = lazy(
  () => import("../../../components/app/ips/spectra/GameDescriptionSection")
);
const StrategySection = lazy(() => import("../../../components/app/ips/spectra/StrategySection"));
const DetailsSection = lazy(() => import("../../../components/app/ips/spectra/DetailsSection"));
const MainFactorsSection = lazy(
  () => import("../../../components/app/ips/spectra/MainFactorsSection")
);
const TournamentsSection = lazy(
  () => import("../../../components/app/ips/spectra/TournamentsSection")
);
const Web3Section = lazy(() => import("../../../components/app/ips/spectra/Web3Section"));
const CurrentStateSection = lazy(
  () => import("../../../components/app/ips/spectra/CurrentStateSection")
);
const PrototypeDevelopmentSection = lazy(
  () => import("../../../components/app/ips/spectra/PrototypeDevelopmentSection")
);
const BeyondPrototypeSection = lazy(
  () => import("../../../components/app/ips/spectra/BeyondPrototypeSection")
);
const GenesisNftFundsSection = lazy(
  () => import("../../../components/app/ips/spectra/GenesisNftFundsSection")
);
const HiresSection = lazy(() => import("../../../components/app/ips/spectra/HiresSection"));
const ScheduleSection = lazy(() => import("../../../components/app/ips/spectra/ScheduleSection"));

export default function SpectraPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<div>Loading...</div>}>
          <CommunityEngagementSection />
          <SpectraOverviewSection />
          <GameDescriptionSection />
          <StrategySection />
          <DetailsSection />
          <MainFactorsSection />
          <TournamentsSection />
          <Web3Section />
          <CurrentStateSection />
          <PrototypeDevelopmentSection />
          <BeyondPrototypeSection />
          <GenesisNftFundsSection />
          <HiresSection />
          <ScheduleSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
