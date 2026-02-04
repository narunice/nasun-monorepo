import { useState, useCallback, Suspense, lazy } from "react";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import PadoHeroSectionSkeleton from "@/sections/ecosystem/pado/PadoHeroSectionSkeleton";

const PadoPitchHeroSection = lazy(
  () => import("@/sections/ecosystem/pado-pitch/PadoPitchHeroSection"),
);
const PadoPitchContent = lazy(
  () => import("@/sections/ecosystem/pado-pitch/PadoPitchContent"),
);

export default function PadoPitchPage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);
    await Promise.all([import("@/sections/ecosystem/pado-pitch/PadoPitchContent")]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  return (
    <ErrorBoundary>
      <Suspense fallback={<PadoHeroSectionSkeleton />}>
        <PadoPitchHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
        {isVideoReady && (
          <>
            <PadoPitchContent />
          </>
        )}
      </Suspense>
    </ErrorBoundary>
  );
}
