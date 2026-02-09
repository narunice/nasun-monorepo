import React, { Suspense, lazy } from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLoading } from "../../components/ui";
import ErrorBoundary from "../../components/layout/ErrorBoundary";

const InfraOverviewContent = lazy(() => import("@/sections/infra/InfraOverviewContent"));

function InfraOverviewPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <InfraOverviewContent />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}

export default React.memo(InfraOverviewPage);
