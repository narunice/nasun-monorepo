import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

const GostopSection = lazy(() => import("@/sections/ecosystem/gostop/GostopSection"));

export default function GostopPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading fullScreen />}>
          <GostopSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
