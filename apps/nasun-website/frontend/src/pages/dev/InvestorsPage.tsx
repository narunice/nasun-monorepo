import React, { Suspense, lazy } from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLoading } from "../../components/ui";
import ErrorBoundary from "../../components/layout/ErrorBoundary";

const InvestorsContent = lazy(() => import("@/sections/dev/InvestorsContent"));

function InvestorsPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <InvestorsContent />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}

export default React.memo(InvestorsPage);
