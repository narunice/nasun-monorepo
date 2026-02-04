import { useState, useCallback, Suspense, lazy } from "react";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import PadoHeroSectionSkeleton from "@/sections/ecosystem/pado/PadoHeroSectionSkeleton";

const PadoTechHeroSection = lazy(
  () => import("@/sections/ecosystem/pado-tech/PadoTechHeroSection"),
);
const PadoTechContent = lazy(
  () => import("@/sections/ecosystem/pado-tech/PadoTechContent"),
);

export default function PadoTechPage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);
    await Promise.all([import("@/sections/ecosystem/pado-tech/PadoTechContent")]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  return (
    <ErrorBoundary>
      <Suspense fallback={<PadoHeroSectionSkeleton />}>
        <PadoTechHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
        {isVideoReady && (
          <>
            <PadoTechContent />
          </>
        )}
      </Suspense>
    </ErrorBoundary>
  );
}
