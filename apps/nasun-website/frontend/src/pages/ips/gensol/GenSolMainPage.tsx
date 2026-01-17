import { Suspense, lazy } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { SectionLoading } from "@/components/ui/SectionLoading";

// Lazy load section components
const GenSolHeroSection = lazy(() => import("@/components/app/ips/gensol/main/GenSolHeroSection"));
const NarrativeContent = lazy(() => import("@/components/app/ips/gensol/main/NarrativeContent"));
const PowerOfStoriesSection = lazy(
  () => import("@/components/app/ips/gensol/main/PowerOfStoriesSection")
);

export default function GenSolMainPage() {
  return (
    <ErrorBoundary>
      <PageLayout className="!pt-0">
        {/* Hero Section */}
        <Suspense fallback={<SectionLoading fullScreen />}>
          <GenSolHeroSection />
        </Suspense>

        {/* Power of Stories Section */}
        <Suspense fallback={null}>
          <PowerOfStoriesSection />
        </Suspense>

        {/* Narrative Content Section - 전체 너비 배경 이미지 */}
        <Suspense fallback={null}>
          <NarrativeContent />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
