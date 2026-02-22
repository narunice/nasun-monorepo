import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { SectionLayout } from "../components/layout/SectionLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { usePageLoading } from "../contexts/PageLoadingContext";
import PadoHeroSectionSkeleton from "../sections/ecosystem/pado/PadoHeroSectionSkeleton";

const PadoDraftContent = lazy(() => import("@/sections/ecosystem/pado/PadoDraftContent"));
const PadoHeroSection = lazy(() => import("@/sections/ecosystem/pado/PadoHeroSection"));

export default function PadoDraftPage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  useEffect(() => {
    setIsPageReady(false);
  }, [setIsPageReady]);

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);

    await Promise.all([import("../sections/ecosystem/pado/PadoDraftContent")]);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  return (
    <ErrorBoundary
      fallback={
        <SectionLayout>
          <p>Failed to load</p>
        </SectionLayout>
      }
    >
      <Suspense fallback={<PadoHeroSectionSkeleton />}>
        <PadoHeroSection
          onVideoReady={handleVideoReady}
          isVideoReady={isVideoReady}
          translationNs="pado-draft"
        />
        {isVideoReady && <PadoDraftContent />}
      </Suspense>
    </ErrorBoundary>
  );
}
