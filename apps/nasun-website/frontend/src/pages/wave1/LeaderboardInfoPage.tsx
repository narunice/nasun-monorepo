import { Suspense, lazy } from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

const LeaderboardInfoSection = lazy(
  () => import("../../components/app/wave1/leaderboard-info/LeaderboardInfoSection")
);

export default function LeaderboardInfoPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading fullScreen />}>
          <LeaderboardInfoSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
