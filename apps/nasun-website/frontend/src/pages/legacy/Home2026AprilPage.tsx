import { Suspense, lazy, useState, useCallback, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { SectionLayout } from "../../components/layout/SectionLayout";
import { ScrollSnapContainer } from "../../components/layout/ScrollSnapContainer";
import { ScrollSnapSection } from "../../components/layout/ScrollSnapSection";
import { useHomePageLoading } from "../../contexts/PageLoadingContext";
import { JsonLd, NASUN_ORG_SCHEMA } from "../../utils/jsonLd";

// TriptychSection: static import (first visible section, no heavy deps like framer-motion)
import TriptychSection from "../../sections/home/legacy/TriptychSection";
// Preload triptych images for LCP
import kaeboImg from "@/assets/images/Princess-Kaebo-Fixed.webp";
import josenImg from "@/assets/images/josen.webp";
import canyonImg from "@/assets/images/canyon.webp";

// Below-fold sections
const VisionSection = lazy(() => import("../../sections/home/legacy/VisionSection"));
const WhatWeBuildingSection = lazy(() => import("../../sections/home/legacy/WhatWeBuildingSection"));
const AwardsGrantsSection = lazy(() => import("../../sections/home/legacy/AwardsGrantsSection"));

export default function Home2026AprilPage() {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const { setIsPageReady } = useHomePageLoading();

  useEffect(() => {
    setIsPageReady(false);
  }, [setIsPageReady]);

  const handleVideoReady = useCallback(() => {
    setIsVideoReady(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPageReady(true);
      });
    });
  }, [setIsPageReady]);

  const errorFallback = (
    <SectionLayout>
      <p className="text-nasun-white">Failed to load section</p>
    </SectionLayout>
  );

  return (
    <div className="bg-nasun-black">
      <Helmet>
        <link rel="preload" as="image" href={kaeboImg} type="image/webp" />
        <link rel="preload" as="image" href={josenImg} type="image/webp" />
        <link rel="preload" as="image" href={canyonImg} type="image/webp" />
      </Helmet>
      <JsonLd data={NASUN_ORG_SCHEMA} />

      <ScrollSnapContainer>
        <ScrollSnapSection>
          <TriptychSection />
        </ScrollSnapSection>

        <ErrorBoundary fallback={errorFallback}>
          <Suspense fallback={null}>
            {/* VisionSection: ENTERTAINMENT/TECHNOLOGY/FINANCE/UNIFIED */}
            <ScrollSnapSection>
              <VisionSection shouldLoadVideo={true} onVideoReady={handleVideoReady} />
            </ScrollSnapSection>

            {/* WhatWeBuildingSection - 제품 캐러셀 */}
            <ScrollSnapSection allowTallContent={true}>
              <WhatWeBuildingSection />
            </ScrollSnapSection>
          </Suspense>
        </ErrorBoundary>
      </ScrollSnapContainer>

      {isVideoReady && (
        <ErrorBoundary fallback={errorFallback}>
          <Suspense fallback={null}>
            <ScrollSnapSection allowTallContent={true}>
              <AwardsGrantsSection />
            </ScrollSnapSection>
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
