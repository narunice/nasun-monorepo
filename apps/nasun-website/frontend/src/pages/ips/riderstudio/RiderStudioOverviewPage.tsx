import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

const RiderOverview = lazy(
  () => import("@/sections/ips/rider-studio/RiderOverview")
);

export default function RiderStudioOverviewPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading fullScreen />}>
          <RiderOverview />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
