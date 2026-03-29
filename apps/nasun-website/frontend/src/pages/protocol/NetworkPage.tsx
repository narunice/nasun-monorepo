import { Suspense, lazy, useState, useCallback, useEffect } from "react";

import { SectionLayout } from "../../components/layout/SectionLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { usePageLoading } from "../../contexts/PageLoadingContext";
import { useEpochInfo, useTPS } from "../../hooks/network/useNetworkData";

import NetworkHeroSectionSkeleton from "../../sections/network/network/NetworkHeroSectionSkeleton";

const NetworkHeroSection = lazy(
  () => import("../../sections/network/network/NetworkHeroSection")
);

// NEW DESIGN - 새로운 디자인 섹션들
const NasunNetworkSection = lazy(
  () => import("../../sections/network/network/NasunNetworkSection")
);
const NasunTokenSection = lazy(
  () => import("../../sections/network/network/NasunTokenSection")
);
const MoveTogetherSection = lazy(
  () => import("../../sections/network/network/MoveTogetherSection")
);
const HowNasunWorksSection = lazy(
  () => import("../../sections/network/network/HowNasunWorksSection")
);
const BuiltForCoordinationSection = lazy(
  () => import("../../sections/network/network/BuiltForCoordinationSection")
);
const WhoBuildsHereSection = lazy(
  () => import("../../sections/network/network/WhoBuildsHereSection")
);
const NetworkActivitySection = lazy(
  () => import("../../sections/network/network/NetworkActivity")
);
const TokenDistributionSection = lazy(
  () => import("../../sections/network/network/TokenDistributionSection")
);
const TechnicalFoundationSection = lazy(
  () => import("../../sections/network/network/TechnicalFoundationSection")
);
const ForBuildersSection = lazy(
  () => import("../../sections/network/network/ForBuildersSection")
);

const VisionNetworkPage = () => {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  // Prefetch RPC data in parallel with video loading
  // React Query cache ensures NetworkActivitySection gets instant data on mount
  useEpochInfo();
  useTPS();

  // 페이지 마운트 시 페이지 준비 상태를 false로 설정 (Footer 숨김)
  useEffect(() => {
    setIsPageReady(false);
  }, [setIsPageReady]);

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);

    // 중요한 섹션들을 프리로드하여 레이아웃 시프트 방지
    await Promise.all([
      // New Design
      import("../../sections/network/network/NasunNetworkSection"),
      import("../../sections/network/network/NasunTokenSection"),
    ]);

    // 비디오가 화면에 렌더링된 후 Footer 표시 (레이아웃 시프트 방지)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  // 스켈레톤 방식: 스크롤 방지 불필요 (공간이 이미 확보됨)

  // Suspense fallback: Use NetworkHeroSectionSkeleton to prevent layout shift
  // This ensures h-screen space is reserved immediately
  const suspenseFallback = <NetworkHeroSectionSkeleton />;

  const errorFallback = (
    <SectionLayout>
      <p className="text-nasun-white">Failed to load section</p>
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
            <NetworkActivitySection />
            <HowNasunWorksSection />
            <BuiltForCoordinationSection />
            <WhoBuildsHereSection />
            <NasunTokenSection />
            {/* <TokenDistributionSection /> */}
            <TechnicalFoundationSection />
            <MoveTogetherSection />
            <ForBuildersSection />
          </>
        )}
      </Suspense>
    </ErrorBoundary>
  );
};

export default VisionNetworkPage;