import React, { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BattalionNftPage as BattalionNftComponent } from "../../sections/wave1/battalion-nft/BattalionNftPage";
import { PageLayout } from "../../components/layout/PageLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { usePageLoading } from "../../contexts/PageLoadingContext";
import { useBattalionNftStore } from "../../stores/useBattalionNftStore";
import BattalionNftHeroSectionSkeleton from "../../sections/wave1/battalion-nft/BattalionNftHeroSectionSkeleton";
import { JsonLd, BATTALION_NFT_EVENT_SCHEMA } from "../../utils/jsonLd";

const BattalionNftHeroSection = lazy(
  () => import("../../sections/wave1/battalion-nft/BattalionNftHeroSection")
);

const DevBattalionNftPage: React.FC = () => {
  const { t } = useTranslation("common");
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();
  const { currentStep } = useBattalionNftStore();

  const showHeroVideo = currentStep === 1;

  useEffect(() => {
    if (showHeroVideo) {
      setIsPageReady(false);
    } else {
      setIsPageReady(true);
    }
  }, [setIsPageReady, showHeroVideo]);

  const handleVideoReady = useCallback(() => {
    setIsVideoReady(true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  const suspenseFallback = <BattalionNftHeroSectionSkeleton />;

  return (
    <PageLayout className={showHeroVideo ? "!pt-0" : ""}>
      <JsonLd data={BATTALION_NFT_EVENT_SCHEMA} />
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-latte">{t("error.generic", { ns: "common" })}</p>
          </SectionLayout>
        }
      >
        <Suspense fallback={suspenseFallback}>
          {showHeroVideo && (
            <BattalionNftHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
          )}
          <BattalionNftComponent />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
};

export default DevBattalionNftPage;
