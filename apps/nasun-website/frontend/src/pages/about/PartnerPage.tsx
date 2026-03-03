import React, { Suspense, lazy } from "react";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLoading } from "../../components/ui";
import ErrorBoundary from "../../components/layout/ErrorBoundary";

const PartnerContent = lazy(() => import("@/sections/about/PartnerContent"));

function PartnerPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <PartnerContent />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}

export default React.memo(PartnerPage);
