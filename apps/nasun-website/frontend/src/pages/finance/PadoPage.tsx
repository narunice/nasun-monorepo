import { useEffect } from "react";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import { JsonLd, PADO_APP_SCHEMA } from "@/utils/jsonLd";
import PadoHeroSection from "@/sections/ecosystem/pado/PadoHeroSection";
import PadoWhySection from "@/sections/ecosystem/pado/PadoWhySection";
import PadoAccountSection from "@/sections/ecosystem/pado/PadoAccountSection";
import PadoLoopSection from "@/sections/ecosystem/pado/PadoLoopSection";
import PadoProductsSection from "@/sections/ecosystem/pado/PadoProductsSection";
import PadoFutureSection from "@/sections/ecosystem/pado/PadoFutureSection";
import PadoRoadmapSection from "@/sections/ecosystem/pado/PadoRoadmapSection";
import PadoCtaSection from "@/sections/ecosystem/pado/PadoCtaSection";
import "@/sections/dev/home/dev-home.css";
import "@/sections/dev/about/dev-about.css";
import "@/sections/ecosystem/pado/pado-theme.css";

export default function PadoPage() {
  const { setIsPageReady } = usePageLoading();

  // PageLoadingContext defaults to a 1s footer-reveal timer for non-video-hero
  // routes. The catena hero plays inline, so signal ready on mount to avoid
  // the lingering footer-hidden state.
  useEffect(() => {
    setIsPageReady(true);
  }, [setIsPageReady]);

  const errorFallback = (
    <div className="ch-section">
      <div className="ch-container">
        <p>Failed to load section</p>
      </div>
    </div>
  );

  return (
    <main className="dev-home-catena pado-theme" data-theme="dark">
      <JsonLd data={PADO_APP_SCHEMA} />
      <ErrorBoundary fallback={errorFallback}>
        <PadoHeroSection />
        <PadoWhySection />
        <PadoAccountSection />
        <PadoLoopSection />
        <PadoProductsSection />
        <PadoFutureSection />
        <PadoRoadmapSection />
        <PadoCtaSection />
      </ErrorBoundary>
    </main>
  );
}
