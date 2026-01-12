import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { SectionLayout } from "../../components/layout/SectionLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { usePageLoading } from "../../contexts/PageLoadingContext";
import PadoHeroSectionSkeleton from "../../components/app/finance/pado/PadoHeroSectionSkeleton";

// Lazy load section components (3 sections total)
const PadoHeroSection = lazy(() => import("../../components/app/finance/pado/PadoHeroSection"));
const PadoOverviewSection = lazy(
  () => import("../../components/app/finance/pado/PadoOverviewSection")
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
      import("../../components/app/finance/pado/PadoComplianceSection"),
    ]);

    // 비디오가 화면에 렌더링된 후 Footer 표시 (레이아웃 시프트 방지)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  // 스켈레톤 방식: 스크롤 방지 불필요 (공간이 이미 확보됨)

  return (
    <ErrorBoundary
      fallback={
        <SectionLayout>
          <p>Failed to load</p>
        </SectionLayout>
      }
    >
      <Suspense fallback={<PadoHeroSectionSkeleton />}>
        <PadoHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
        {/* 비디오 준비 후 렌더링하여 레이아웃 시프트 방지 */}
        {isVideoReady && (
          <>
            <PadoOverviewSection />
            <PadoComplianceSection />
          </>
        )}
      </Suspense>
    </ErrorBoundary>
  );
}
