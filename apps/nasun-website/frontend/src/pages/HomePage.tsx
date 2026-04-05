import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { SectionLayout } from "../components/layout/SectionLayout";
import { ScrollSnapContainer } from "../components/layout/ScrollSnapContainer";
import { ScrollSnapSection } from "../components/layout/ScrollSnapSection";
import { useHomePageLoading } from "../contexts/PageLoadingContext";
import { JsonLd, NASUN_ORG_SCHEMA } from "../utils/jsonLd";

import HeroSectionSkeleton from "../sections/home/HeroSectionSkeleton";

// All sections lazy-loaded for optimal code splitting.
// HeroSection's poster image is preloaded via <Helmet> (home-page only),
// so LCP is fast even with lazy loading. Static import was reverted because
// it pulled framer-motion (123KB) into the critical path, tripling TBT.
const HeroSection = lazy(() => import("../sections/home/HeroSection"));

const TriptychSection = lazy(() => import("../sections/home/TriptychSection"));

// Below-fold sections
const VisionSection = lazy(() => import("../sections/home/VisionSection"));
const WhatWeBuildingSection = lazy(() => import("../sections/home/WhatWeBuildingSection"));
const Wave1Section = lazy(() => import("../sections/home/Wave1Section"));
const AwardsGrantsSection = lazy(() => import("../sections/home/AwardsGrantsSection"));
const NewsEventsSection = lazy(() => import("../sections/home/NewsEventsSection"));

export default function HomePage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isVisionVideoReady, setIsVisionVideoReady] = useState(false);
  const { setIsPageReady } = useHomePageLoading();

  // 홈페이지 마운트 시 페이지 준비 상태가 false임을 보장 (Context에서 자동 처리되지만 명시적 설정)
  useEffect(() => {
    setIsPageReady(false);
  }, [setIsPageReady]);

  // Hero 비디오 로딩 완료 핸들러
  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);

    // Preload critical above-the-fold sections before showing footer
    // This prevents layout shift when sections load after footer appears
    await Promise.all([
      import("../sections/home/VisionSection"),
      import("../sections/home/NewsEventsSection"),
    ]);

    // 비디오가 화면에 렌더링된 후 Footer 표시 (레이아웃 시프트 방지)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  // Vision 비디오 로딩 완료 핸들러
  const handleVisionVideoReady = useCallback(() => {
    setIsVisionVideoReady(true);
  }, []);

  // 스켈레톤 방식: 스크롤 방지 불필요 (공간이 이미 확보됨)

  // Suspense fallback: Use HeroSectionSkeleton to prevent layout shift
  // This ensures h-screen space is reserved immediately
  const suspenseFallback = <HeroSectionSkeleton />;

  const errorFallback = (
    <SectionLayout>
      <p className="text-nasun-white">Failed to load section</p>
    </SectionLayout>
  );

  // HeroSection is always rendered, using CSS-based positioning
  // This prevents re-mounting and state reset issues
  return (
    <div className="bg-nasun-black">
      <Helmet>
        <link rel="preload" as="image" href="/images/posters/Full-Trailer184s-rf28.webp" type="image/webp" />
      </Helmet>
      <JsonLd data={NASUN_ORG_SCHEMA} />
      {/* Snap Scroll 섹션들 (Hero ~ Wave1) */}
      <ScrollSnapContainer>
        <ErrorBoundary fallback={errorFallback}>
          <Suspense fallback={suspenseFallback}>
            {/* TriptychSection: Wave 1 히어로 (Alliance / Genesis Pass / Airdrop) */}
            <ScrollSnapSection>
              <TriptychSection />
            </ScrollSnapSection>

            {/* HeroSection: 트레일러 + 타이밍 애니메이션 */}
            <ScrollSnapSection>
              <HeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
            </ScrollSnapSection>

            {/* VisionSection: ENTERTAINMENT/TECHNOLOGY/FINANCE/UNIFIED */}
            {/* Hero와 동시에 로딩 시작 */}
            <ScrollSnapSection>
              <VisionSection shouldLoadVideo={true} onVideoReady={handleVisionVideoReady} />
            </ScrollSnapSection>

            {/* WhatWeBuildingSection - 제품 캐러셀 (초광폭에서 콘텐츠 높이 초과 허용) */}
            <ScrollSnapSection allowTallContent={true}>
              <WhatWeBuildingSection />
            </ScrollSnapSection>

            {/* NewsEventsSection - 긴 컨텐츠 허용 */}
            <ScrollSnapSection allowTallContent={true}>
              <NewsEventsSection />
            </ScrollSnapSection>

            {/* Wave1Section */}
            {/* Vision 비디오 로딩 후 시작 */}
            <ScrollSnapSection allowTallContent={true} disableSnapBelowLg={true}>
              <Wave1Section
                shouldLoadVideo={isVisionVideoReady}
              />
            </ScrollSnapSection>

          </Suspense>
        </ErrorBoundary>
      </ScrollSnapContainer>

      {/* 일반 스크롤 섹션 - 비디오 준비 후에만 렌더링 (레이아웃 시프트 방지) */}
      {isVideoReady && (
        <ErrorBoundary fallback={errorFallback}>
          <Suspense fallback={suspenseFallback}>
            {/* AwardsGrantsSection - 긴 컨텐츠 허용 */}
            <ScrollSnapSection allowTallContent={true}>
              <AwardsGrantsSection />
            </ScrollSnapSection>
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
