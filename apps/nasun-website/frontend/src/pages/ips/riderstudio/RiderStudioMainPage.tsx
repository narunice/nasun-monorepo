import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

const RiderMain = lazy(
  () => import("@/sections/ips/rider-studio/RiderMain")
);

export default function RiderStudioMainPage() {
  return (
    <ErrorBoundary>
      <PageLayout className="!pt-0">
        <Suspense fallback={<SectionLoading fullScreen />}>
          <RiderMain />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
