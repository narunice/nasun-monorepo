import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

const TheHeistSection = lazy(() => import("@/sections/ips/gensol/animation/TheHeistSection"));

export default function HeistPage() {
  return (
    <ErrorBoundary>
      <PageLayout className="!pt-0">
        <Suspense fallback={<SectionLoading fullScreen />}>
          <TheHeistSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
