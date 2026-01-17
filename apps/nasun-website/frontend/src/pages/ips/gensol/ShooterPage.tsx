import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";

const SpectraSection = lazy(() => import("@/components/app/ips/gensol/shooter/SpectraSection"));

export default function ShooterPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={null}>
          <SpectraSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
