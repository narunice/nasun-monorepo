import { Suspense, lazy, useState, useCallback, useEffect } from "react";

import { SectionLayout } from "../../components/layout/SectionLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { usePageLoading } from "../../contexts/PageLoadingContext";

const NetworkHeroSection = lazy(() => import("../../components/app/protocol/network/NetworkHeroSection"));

// NEW DESIGN - 새로운 디자인 섹션들
const NasunNetworkSection = lazy(() => import("../../components/app/protocol/network/NasunNetworkSection"));
const NasunTokenSection = lazy(() => import("../../components/app/protocol/network/NasunTokenSection"));
const MoveTogetherSection = lazy(() => import("../../components/app/protocol/network/MoveTogetherSection"));
const TokenDistributionSection = lazy(() => import("../../components/app/protocol/network/TokenDistributionSection"));



const VisionNetworkPage = () => {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  // 페이지 마운트 시 페이지 준비 상태를 false로 설정 (Footer 숨김)
  useEffect(() => {
    setIsPageReady(false);
  }, [setIsPageReady]);

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);

    // 중요한 섹션들을 프리로드하여 레이아웃 시프트 방지
    await Promise.all([
      // New Design
      import("../../components/app/protocol/network/NasunNetworkSection"),
      import("../../components/app/protocol/network/NasunTokenSection"),
    ]);

    // 비디오가 화면에 렌더링된 후 Footer 표시 (레이아웃 시프트 방지)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  // 비디오 로딩 중에는 body 스크롤 방지
  useEffect(() => {
    if (!isVideoReady) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isVideoReady]);

  // Suspense fallback: null to prevent unnecessary loading spinners
  const suspenseFallback = null;

  const errorFallback = (
    <SectionLayout>
      <p className="text-nasun-latte">Failed to load section</p>
    </SectionLayout>
  );

  return (
    <ErrorBoundary fallback={errorFallback}>
      <Suspense fallback={suspenseFallback}>
        {/* Hero Section - NSN NETWORK (CSS 기반 위치 제어) */}
        <NetworkHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />

        {/* NEW DESIGN - 새로운 디자인 섹션들 (비디오 준비 후 렌더링하여 레이아웃 시프트 방지) */}
        {isVideoReady && (
          <>
            <NasunNetworkSection />
            <NasunTokenSection />
            <MoveTogetherSection />
            <TokenDistributionSection />
          </>
        )}
      </Suspense>
    </ErrorBoundary>
  );
};

export default VisionNetworkPage;
