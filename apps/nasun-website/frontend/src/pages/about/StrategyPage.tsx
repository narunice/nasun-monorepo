import React, { Suspense, lazy } from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLoading } from "../../components/ui";
import ErrorBoundary from "../../components/layout/ErrorBoundary";

// Lazy load consolidated sections

const StrategyOverviewV2 = lazy(() => import("@/components/app/about/StrategyOverviewV2"));

function StrategyPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <StrategyOverviewV2 />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}

export default React.memo(StrategyPage);
