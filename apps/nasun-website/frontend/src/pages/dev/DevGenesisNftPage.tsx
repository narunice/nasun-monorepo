import React, { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { GenesisNftPage as GenesisNftComponent } from "../../sections/genesis-nft/GenesisNftPage";
import { PageLayout } from "../../components/layout/PageLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { usePageLoading } from "../../contexts/PageLoadingContext";
import { useGenesisNftStore } from "../../stores/useGenesisNftStore";
import GenesisNftHeroSectionSkeleton from "../../sections/genesis-nft/GenesisNftHeroSectionSkeleton";

const GenesisNftHeroSection = lazy(
  () => import("../../sections/genesis-nft/GenesisNftHeroSection")
);

const DevGenesisNftPage: React.FC = () => {
  const { t } = useTranslation("common");
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();
  const { currentStep } = useGenesisNftStore();

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

  const suspenseFallback = <GenesisNftHeroSectionSkeleton />;

  return (
    <PageLayout className={showHeroVideo ? "!pt-0" : ""}>
      <ErrorBoundary
        fallback={
          <SectionLayout>
            <p className="text-nasun-white">{t("error.generic", { ns: "common" })}</p>
          </SectionLayout>
        }
      >
        <Suspense fallback={suspenseFallback}>
          {showHeroVideo && (
            <GenesisNftHeroSection onVideoReady={handleVideoReady} isVideoReady={isVideoReady} />
          )}
          <GenesisNftComponent />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
};

export default DevGenesisNftPage;
