import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { SectionLayout } from "../../components/layout/SectionLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { usePageLoading } from "../../contexts/PageLoadingContext";

// Lazy load all section components
const PadoHeroSection = lazy(() => import("../../components/app/finance/pado/PadoHeroSection"));
const PadoOverviewSection = lazy(
  () => import("../../components/app/finance/pado/PadoOverviewSection")
);
const PadoFeaturesArchitectureSection = lazy(
  () => import("../../components/app/finance/pado/PadoFeaturesArchitectureSection")
);
const PadoComplianceSection = lazy(
  () => import("../../components/app/finance/pado/PadoComplianceSection")
);

/**
 * PadoPage 컴포넌트
 *
 * The Pado Initiative 소개 페이지
 */
export default function PadoPage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  // Page mount: hide footer
  useEffect(() => {
    setIsPageReady(false);
  }, [setIsPageReady]);

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);

    // Preload critical sections
    await Promise.all([
      import("../../components/app/finance/pado/PadoOverviewSection"),
      import("../../components/app/finance/pado/PadoFeaturesArchitectureSection"),
      import("../../components/app/finance/pado/PadoComplianceSection"),
    ]);

    setIsPageReady(true); // Show footer
  }, [setIsPageReady]);

  // Prevent scroll during video loading
  useEffect(() => {
    document.body.style.overflow = isVideoReady ? "auto" : "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isVideoReady]);

  return (
    <ErrorBoundary
      fallback={
        <SectionLayout>
          <p>Failed to load</p>
        </SectionLayout>
      }
    >
      <Suspense fallback={null}>
        <PadoHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
        <PadoOverviewSection />
        <PadoFeaturesArchitectureSection />
        <PadoComplianceSection />
      </Suspense>
    </ErrorBoundary>
  );
}
