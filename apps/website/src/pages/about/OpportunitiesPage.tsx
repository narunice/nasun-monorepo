import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout } from "../../components/layout/PageLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import waveVideoBg from "../../assets/videos/wave-bg2-4x-RIFE-RIFE3.1-96fps-cfr21.mp4";

const OpportunitiesSection = lazy(() => import("../../components/app/about/OpportunitiesSection"));

export default function OpportunitiesPage() {
  const { t } = useTranslation(["opportunities", "common"]);

  return (
    <PageLayout className="relative">
      {/* Background Video Container - Full Browser Width */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1920px] aspect-[16/9] min-h-[700px] z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          webkit-playsinline="true"
          preload="metadata"
          x-webkit-airplay="allow"
          className="w-full h-full"
          style={{
            transform: "scaleX(-1)",
            objectFit: "cover",
            objectPosition: "top center",
          }}
        >
          <source src={waveVideoBg} type="video/mp4" />
        </video>

        {/* Radial Gradient Overlay - Top Right Corner (nasun-c4 to transparent) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at top right, rgba(61, 126, 169, 0.50) 0%, transparent 45%)",
          }}
        />

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
      <div className="relative z-10 min-h-screen">
        <ErrorBoundary fallback={<div>{t("common:info.loading")}</div>}>
          <Suspense fallback={<div>{t("common:info.loading")}</div>}>
            <OpportunitiesSection />
          </Suspense>
        </ErrorBoundary>
      </div>
    </PageLayout>
  );
}
