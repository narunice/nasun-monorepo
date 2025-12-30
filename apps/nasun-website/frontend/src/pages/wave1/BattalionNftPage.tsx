/**
 * Battalion NFT Page
 *
 * @description
 * Wave 1 Battalion NFT Free Mint 이벤트 페이지
 * Hero 섹션과 메인 컨텐츠를 포함
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import React, { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BattalionNftPage as BattalionNftComponent } from "../../components/app/wave1/battalion-nft/BattalionNftPage";
import { PageLayout } from "../../components/layout/PageLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { usePageLoading } from "../../contexts/PageLoadingContext";
import { useBattalionNftStore } from "../../stores/useBattalionNftStore";

const BattalionNftHeroSection = lazy(
  () => import("../../components/app/wave1/battalion-nft/BattalionNftHeroSection")
);

const BattalionNftPage: React.FC = () => {
  const { t } = useTranslation(["battalion-nft", "common"]);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();
  const { currentStep } = useBattalionNftStore();

  // Step 1에서만 히어로 비디오 표시
  const showHeroVideo = currentStep === 1;

  // 페이지 마운트 시 페이지 준비 상태 설정
  useEffect(() => {
    if (showHeroVideo) {
      // Step 1: 비디오 로딩 완료까지 Footer 숨김
      setIsPageReady(false);
    } else {
      // Step 2+: 비디오 없으므로 바로 페이지 준비 완료
      setIsPageReady(true);
    }
  }, [setIsPageReady, showHeroVideo]);

  const handleVideoReady = useCallback(async () => {
    setIsVideoReady(true);

    // 메인 컴포넌트 프리로드
    await import("../../components/app/wave1/battalion-nft/BattalionNftPage");

    // 비디오가 화면에 렌더링된 후 Footer 표시 (레이아웃 시프트 방지)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  // 스켈레톤 방식: 스크롤 방지 불필요 (공간이 이미 확보됨)

  // Suspense fallback: null to prevent unnecessary loading spinners
  const suspenseFallback = null;

  return (
    <PageLayout className="!pt-0">
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-latte">{t("error.generic", { ns: "common" })}</p>
          </SectionLayout>
        }
      >
        <Suspense fallback={suspenseFallback}>
          {/* Hero Section - Step 1에서만 표시 */}
          {showHeroVideo && (
            <BattalionNftHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
          )}

          {/* 메인 컨텐츠 */}
          <BattalionNftComponent />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
};

export default BattalionNftPage;
