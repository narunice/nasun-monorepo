import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

// Renamed in S6 — the section directory keeps the legacy `baram-dark` folder
// name for now (deferred to S7 to avoid breaking imports during cutover).
const NasunAiContent = lazy(() => import("@/sections/ecosystem/baram-dark/BaramDarkContent"));

export default function NasunAiPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading fullScreen />}>
          <NasunAiContent />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
