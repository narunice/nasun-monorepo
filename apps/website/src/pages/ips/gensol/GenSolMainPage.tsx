import { Suspense, lazy } from "react";
import { PageLayout } from "../../../components/layout/PageLayout";
import ErrorBoundary from "../../../components/layout/ErrorBoundary";

// Lazy load section components
const GenSolHeroSection = lazy(() => import("../../../components/app/ips/gensol/GenSolHeroSection"));
const GenSolIntroSection = lazy(() => import("../../../components/app/ips/gensol/GenSolIntroSection"));
const PowerOfStoriesSection = lazy(() => import("../../../components/app/ips/gensol/PowerOfStoriesSection"));

export default function GenSolMainPage() {
  return (
    <ErrorBoundary>
      <PageLayout className="!pt-0">
        {/* Hero Section */}
        <Suspense fallback={null}>
          <GenSolHeroSection />
        </Suspense>

        {/* Power of Stories Section */}
        <Suspense fallback={null}>
          <PowerOfStoriesSection />
        </Suspense>

        {/* Intro Section - 전체 너비 배경 이미지 */}
        <Suspense fallback={null}>
          <GenSolIntroSection />
        </Suspense>
      </PageLayout>
    </ErrorBoundary>
  );
}
