import { Suspense, lazy } from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

const EarlyContributorsSection = lazy(() =>
  import("../../components/app/wave1/early-contributors/EarlyContributorsSection").then(
    (module) => ({ default: module.EarlyContributorsSection })
  )
);

export default function EarlyContributorsPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading fullScreen />}>
          <EarlyContributorsSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
