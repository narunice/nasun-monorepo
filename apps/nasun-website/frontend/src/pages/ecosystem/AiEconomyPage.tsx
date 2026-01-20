import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

// Lazy load content
const AiEconomyContent = lazy(() => import("@/components/app/ecosystem/ai-economy/AiEconomyContent"));

export default function AiEconomyPage() {
  return (
    <ErrorBoundary>
      <PageLayout>
        <Suspense fallback={<SectionLoading fullScreen />}>
          <AiEconomyContent />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
