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
        <div
          className="baram-light-theme"
          style={{ backgroundColor: "#faf7f4", color: "#191615" }}
        >
          <Suspense fallback={<SectionLoading fullScreen />}>
            <BaramContent />
          </Suspense>
        </div>
      </PageLayout>
    </ErrorBoundary>
  );
}
