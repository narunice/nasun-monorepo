import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { SectionLayout } from "../../components/layout/SectionLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { usePageLoading } from "../../contexts/PageLoadingContext";
import PadoHeroSectionSkeleton from "../../sections/ecosystem/pado/PadoHeroSectionSkeleton";

const FinanceHeroSection = lazy(() => import("@/sections/ecosystem/finance/FinanceHeroSection"));
const OneAccountSection = lazy(() => import("@/sections/ecosystem/finance/OneAccountSection"));
const UnifiedOnchain = lazy(() => import("@/sections/ecosystem/pado/UnifiedOnchain"));

/**
 * PadoPage - /ecosystem/finance
 *
 * Redesigned finance page with new hero + OneAccount intro,
 * preserving the original UnifiedOnchain content below.
 */
export default function PadoPage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  useEffect(() => {
    setIsPageReady(false);
  }, [setIsPageReady]);

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);

    await Promise.all([
      import("../../sections/ecosystem/finance/OneAccountSection"),
      import("../../sections/ecosystem/pado/UnifiedOnchain"),
    ]);

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
        <FinanceHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
        {isVideoReady && (
          <>
            <OneAccountSection />
            <UnifiedOnchain />
          </>
        )}
      </Suspense>
    </ErrorBoundary>
  );
}
