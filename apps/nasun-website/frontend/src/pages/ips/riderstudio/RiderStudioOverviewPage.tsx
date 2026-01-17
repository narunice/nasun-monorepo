import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

const RiderProcessCardsSection = lazy(
  () => import("@/components/app/ips/rider-studio/RiderProcessCardsSection")
);
const RiderOverviewContentSection = lazy(
  () => import("@/components/app/ips/rider-studio/RiderOverviewContentSection")
);

export default function RiderStudioOverviewPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading fullScreen />}>
          <RiderProcessCardsSection />
          <RiderOverviewContentSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
