import { Suspense, lazy, useState, useEffect } from "react";
import { PageLayout } from "../components/layout/PageLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { useTranslation } from "react-i18next";
import foundersVideoDesktop from "../assets/videos/Founders-Nft-Portal-Rotate-rf22.mp4";
import foundersVideoMobile from "../assets/videos/Founders-Nft-Portal-Rotate-Mobile-rf23.mp4";

const FoundersNftHeroSection = lazy(() => import("../components/app/sale/FoundersNftHeroSection"));
const KeyBenefitsSection = lazy(() => import("../components/app/sale/KeyBenefitsSection"));
// const SaleHeroSection = lazy(() => import("../components/app/sale/SaleHeroSection"));
// const NFTSaleSection = lazy(() => import("../components/app/sale/NFTSaleSection"));
// const TiersComparisonSection = lazy(() => import("../components/app/sale/TiersComparisonSection"));
// const ButtonShowcaseSection = lazy(() => import("../components/app/home/ButtonShowcaseSection"));

const FoundersNftPage = () => {
  const { t } = useTranslation("common");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const videoSrc = isMobile ? foundersVideoMobile : foundersVideoDesktop;

  return (
    <PageLayout className="relative">
      {/* Background Video Container - Full Browser Width */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1920px] aspect-[16/9] min-h-[700px] z-0">
        <video
          key={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="w-full h-full"
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
            <FoundersNftHeroSection />
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

export default FoundersNftPage;
