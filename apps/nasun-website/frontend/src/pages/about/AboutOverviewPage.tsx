import React, { Suspense, lazy } from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLoading } from "../../components/ui";
import ErrorBoundary from "../../components/layout/ErrorBoundary";

const AboutOverviewContent = lazy(() => import("@/sections/about/AboutOverviewContent"));

function AboutOverviewPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <AboutOverviewContent />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}

export default React.memo(AboutOverviewPage);
