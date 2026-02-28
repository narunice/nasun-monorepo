import { Suspense, lazy, useState, useEffect, useCallback } from "react";
import { PageLayout } from "../components/layout/PageLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { useTranslation } from "react-i18next";
import { usePageLoading } from "../contexts/PageLoadingContext";
import { useIsMobile } from "../hooks/useIsMobile";
import GenesisNftHeroSkeleton from "../sections/wave1/genesisNft/GenesisNftHeroSkeleton";
const genesisVideoDesktop = "/videos/Founders-Nft-Portal-Rotate-rf28.mp4";
const genesisVideoMobile = "/videos/Founders-Nft-Portal-Rotate-Mobile-rf28.mp4";

const GenesisNftHeroSection = lazy(() => import("../sections/wave1/genesisNft/GenesisNftHeroSection"));
const KeyBenefitsSection = lazy(() => import("../sections/wave1/genesisNft/KeyBenefitsSection"));
// const SaleHeroSection = lazy(() => import("../sections/wave1/genesisNft/SaleHeroSection"));
// const NFTSaleSection = lazy(() => import("../sections/wave1/genesisNft/NFTSaleSection"));
// const TiersComparisonSection = lazy(() => import("../sections/wave1/genesisNft/TiersComparisonSection"));
// const ButtonShowcaseSection = lazy(() => import("../sections/home/ButtonShowcaseSection"));

const GenesisNftPage = () => {
  const { t } = useTranslation("common");
  const isMobile = useIsMobile();
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = usePageLoading();

  useEffect(() => {
    setIsPageReady(false);
  }, [setIsPageReady]);

  const handleCanPlay = useCallback(() => {
    setIsVideoReady(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  const videoSrc = isMobile ? genesisVideoMobile : genesisVideoDesktop;

  return (
    <PageLayout className="relative">
      {/* Background Video Container - Full Browser Width */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1920px] aspect-[16/9] min-h-[700px] z-0">
        {/* Skeleton Overlay */}
        {!isVideoReady && (
          <div className="absolute inset-0 z-20">
            <GenesisNftHeroSkeleton />
          </div>
        )}

        <video
          key={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster={isMobile ? "/images/posters/Founders-Nft-Portal-Rotate-Mobile-rf28.webp" : "/images/posters/Founders-Nft-Portal-Rotate-rf28.webp"}
          onCanPlay={handleCanPlay}
          className={`w-full h-full transition-opacity duration-500 ${
            isVideoReady ? "opacity-100" : "opacity-0"
          }`}
          style={{
            objectFit: "cover",
            objectPosition: "top center",
          }}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>

        {/* Linear Gradient Overlay - Top transparent to Bottom nasun-black */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, transparent 50%, rgba(25, 22, 21, 0.8) 75%, rgb(25, 22, 21) 100%)",
          }}
        />
      </div>

      {/* Content Section */}
      <div className="relative z-10">
        <ErrorBoundary fallback={<div>Error loading content</div>}>
          <Suspense fallback={<div>{t("info.loading")}</div>}>
            <GenesisNftHeroSection />
            <KeyBenefitsSection />
            {/* <SaleHeroSection />
            <NFTSaleSection />
            <TiersComparisonSection />
            <ButtonShowcaseSection /> */}
          </Suspense>
        </ErrorBoundary>
      </div>
    </PageLayout>
  );
};

export default GenesisNftPage;
