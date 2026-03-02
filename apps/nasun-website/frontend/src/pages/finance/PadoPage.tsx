import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { SectionLayout } from "../../components/layout/SectionLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { usePageLoading } from "../../contexts/PageLoadingContext";
import PadoHeroSectionSkeleton from "../../sections/ecosystem/finance/PadoHeroSectionSkeleton";
import { JsonLd, PADO_APP_SCHEMA } from "../../utils/jsonLd";

const FinanceHeroSection = lazy(() => import("@/sections/ecosystem/finance/FinanceHeroSection"));
const OneAccountSection = lazy(() => import("@/sections/ecosystem/finance/OneAccountSection"));
const FinanceContent = lazy(() => import("@/sections/ecosystem/finance/FinanceContent"));

/**
 * PadoPage - /ecosystem/finance
 *
 * Hero + OneAccount intro + FinanceContent (9 sections following pado-revised design).
 */
export default function PadoPage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  useEffect(() => {
    setIsPageReady(false);
    // Prefetch content sections in parallel with video loading
    import("../../sections/ecosystem/finance/OneAccountSection");
    import("../../sections/ecosystem/finance/FinanceContent");
  }, [setIsPageReady]);

  // Scope pado-navy-theme to this page only
  useEffect(() => {
    document.documentElement.classList.add("pado-navy-theme");
    return () => {
      document.documentElement.classList.remove("pado-navy-theme");
    };
  }, []);

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);

    await Promise.all([
      import("../../sections/ecosystem/finance/OneAccountSection"),
      import("../../sections/ecosystem/finance/FinanceContent"),
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
      <JsonLd data={PADO_APP_SCHEMA} />
      <div className="bg-[#080c16] text-pd4 min-h-screen overflow-x-hidden">
        <Suspense fallback={<PadoHeroSectionSkeleton />}>
          <FinanceHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
          {isVideoReady && (
            <>
              <OneAccountSection />
              <FinanceContent />
            </>
          )}
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}
