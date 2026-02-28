import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

const BaramDarkContent = lazy(() => import("@/sections/ecosystem/baram-dark/BaramDarkContent"));

export default function BaramDarkPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading fullScreen />}>
          <BaramDarkContent />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
