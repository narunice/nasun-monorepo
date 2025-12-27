import React, { Suspense, lazy } from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLoading } from "../../components/ui";
import ErrorBoundary from "../../components/layout/ErrorBoundary";

// Lazy load consolidated sections
const StrategyOverviewSection = lazy(
  () => import("../../components/app/about/strategy/StrategyOverviewSection")
);
const StrategyExecutionSection = lazy(
  () => import("../../components/app/about/strategy/StrategyExecutionSection")
);

function StrategyPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <StrategyOverviewSection />
        </Suspense>

        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <StrategyExecutionSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}

export default React.memo(StrategyPage);
