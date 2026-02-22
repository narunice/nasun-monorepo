import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

const BaramAerContent = lazy(() => import("@/sections/ecosystem/baram-aer/BaramAerContent"));

export default function BaramAerPage() {
  return (
    <ErrorBoundary>
      <PageLayout className="!bg-nasun-white !py-0">
        <div className="baram-light-theme bg-gradient-to-b from-nasun-white via-[#fdf9f3] to-[#f5f0ea] text-nasun-black">
          <Suspense fallback={<SectionLoading fullScreen />}>
            <BaramAerContent />
          </Suspense>
        </div>
      </PageLayout>
    </ErrorBoundary>
  );
}
