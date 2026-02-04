import { useState, useCallback, Suspense, lazy } from "react";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import PadoHeroSectionSkeleton from "@/sections/ecosystem/pado/PadoHeroSectionSkeleton";

const PadoVisionHeroSection = lazy(
  () => import("@/sections/ecosystem/pado-vision/PadoVisionHeroSection"),
);
const PadoVisionContent = lazy(
  () => import("@/sections/ecosystem/pado-vision/PadoVisionContent"),
);

export default function PadoVisionPage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);
    await Promise.all([import("@/sections/ecosystem/pado-vision/PadoVisionContent")]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  return (
    <ErrorBoundary>
      <Suspense fallback={<PadoHeroSectionSkeleton />}>
        <PadoVisionHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
        {isVideoReady && (
          <>
            <PadoVisionContent />
          </>
        )}
      </Suspense>
    </ErrorBoundary>
  );
}
