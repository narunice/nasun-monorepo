import { useState, useCallback, Suspense, lazy } from "react";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import PadoHeroSectionSkeleton from "@/sections/ecosystem/pado/PadoHeroSectionSkeleton";

const PadoRevisedHeroSection = lazy(
  () => import("@/sections/ecosystem/pado-revised/PadoRevisedHeroSection"),
);
const PadoRevisedContent = lazy(
  () => import("@/sections/ecosystem/pado-revised/PadoRevisedContent"),
);

export default function PadoRevisedPage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);
    await Promise.all([import("@/sections/ecosystem/pado-revised/PadoRevisedContent")]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  return (
    <ErrorBoundary>
      <Suspense fallback={<PadoHeroSectionSkeleton />}>
        <PadoRevisedHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
        {isVideoReady && <PadoRevisedContent />}
      </Suspense>
    </ErrorBoundary>
  );
}
