import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { SectionLayout } from "../components/layout/SectionLayout";
import { ScrollSnapContainer } from "../components/layout/ScrollSnapContainer";
import { ScrollSnapSection } from "../components/layout/ScrollSnapSection";
import { useHomePageLoading } from "../contexts/PageLoadingContext";

import HeroSectionSkeleton from "../components/app/home/HeroSectionSkeleton";

// Lazy load all sections
const HeroSectionV3 = lazy(() => import("../components/app/home/HeroSectionV3"));
const VisionSectionV2 = lazy(() => import("../components/app/home/VisionSectionV2"));
const Wave1Section = lazy(() => import("../components/app/home/Wave1SectionV3"));
const NftSaleSection = lazy(() => import("../components/app/home/NftSaleSection"));
const AwardsGrantsSection = lazy(() => import("../components/app/home/AwardsGrantsSection"));
const NewsEventsSection = lazy(() => import("../components/app/home/NewsEventsSection"));

export default function HomePage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = useHomePageLoading();

  // 홈페이지 마운트 시 페이지 준비 상태가 false임을 보장 (Context에서 자동 처리되지만 명시적 설정)
  useEffect(() => {
    setIsPageReady(false);
  }, [setIsPageReady]);

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);

    // Preload critical above-the-fold sections before showing footer
    // This prevents layout shift when sections load after footer appears
    await Promise.all([
      import("../components/app/home/VisionSectionV2"),
      import("../components/app/home/AwardsGrantsSection"),
    ]);

    // 비디오가 화면에 렌더링된 후 Footer 표시 (레이아웃 시프트 방지)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  // 스켈레톤 방식: 스크롤 방지 불필요 (공간이 이미 확보됨)

  // Suspense fallback: Use HeroSectionSkeleton to prevent layout shift
  // This ensures h-screen space is reserved immediately
  const suspenseFallback = <HeroSectionSkeleton />;

  const errorFallback = (
    <SectionLayout>
      <p className="text-nasun-latte">Failed to load section</p>
    </SectionLayout>
  );

  // HeroSection is always rendered, using CSS-based positioning
  // This prevents re-mounting and state reset issues
  return (
    <>
      {/* Snap Scroll 섹션들 (Hero ~ NFT Sale) */}
      <ScrollSnapContainer>
        <ErrorBoundary fallback={errorFallback}>
          <Suspense fallback={suspenseFallback}>
            {/* HeroSectionV3: 맨 위 섹션 (개별 타이밍 애니메이션 + 트레일러) */}
            <ScrollSnapSection>
              <HeroSectionV3 onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
            </ScrollSnapSection>

            {/* VisionSectionV2: ENTERTAINMENT/TECHNOLOGY/FINANCE/UNIFIED */}
            <ScrollSnapSection>
              <VisionSectionV2 />
            </ScrollSnapSection>

            {/* AwardsGrantsSection - 긴 컨텐츠 허용 */}
            <ScrollSnapSection allowTallContent={true}>
              <AwardsGrantsSection />
            </ScrollSnapSection>

            {/* Wave1Section */}
            <ScrollSnapSection allowTallContent={true}>
              <Wave1Section />
            </ScrollSnapSection>

            {/* NftSaleSection - 스냅 스크롤 */}
            <ScrollSnapSection>
              <NftSaleSection />
            </ScrollSnapSection>
          </Suspense>
        </ErrorBoundary>
      </ScrollSnapContainer>

      {/* 일반 스크롤 섹션 - 비디오 준비 후에만 렌더링 (레이아웃 시프트 방지) */}
      {isVideoReady && (
        <ErrorBoundary fallback={errorFallback}>
          <Suspense fallback={suspenseFallback}>
            {/* NewsEventsSection - 긴 컨텐츠 허용 */}
            <ScrollSnapSection allowTallContent={true}>
              <NewsEventsSection />
            </ScrollSnapSection>
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
