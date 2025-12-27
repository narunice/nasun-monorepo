import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui";

const GovernanceSection = lazy(
  () => import("@/features/governance/components/GovernanceSection")
);

const ProposalPage = () => {
  return (
    <PageLayout>
      <ErrorBoundary fallback={<div className="text-red-500">Failed to load section</div>}>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <GovernanceSection />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
};

export default ProposalPage;
