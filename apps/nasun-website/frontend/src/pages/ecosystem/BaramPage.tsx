import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

const BaramContent = lazy(
  () => import("@/sections/ecosystem/baram/BaramContent")
);

export default function BaramPage() {
  return (
    <ErrorBoundary>
      <PageLayout className="!bg-nasun-white">
        <div className="baram-light-theme bg-gradient-to-b from-nasun-white via-[#fdf9f3] to-[#f5f0ea] text-nasun-black">
          <Suspense fallback={<SectionLoading fullScreen />}>
            <BaramContent />
          </Suspense>
        </div>
      </PageLayout>
    </ErrorBoundary>
  );
}
