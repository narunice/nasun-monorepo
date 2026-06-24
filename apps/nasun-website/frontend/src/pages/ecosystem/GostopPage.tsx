import { useEffect } from "react";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { usePageLoading } from "@/contexts/PageLoadingContext";
import { JsonLd, GOSTOP_APP_SCHEMA } from "@/utils/jsonLd";
import GostopSection from "@/sections/ecosystem/gostop/GostopSection";
import "@/sections/dev/home/dev-home.css";
import "@/sections/dev/about/dev-about.css";
import "@/sections/ecosystem/gostop/gostop-theme.css";

export default function GostopPage() {
  const { setIsPageReady } = usePageLoading();

  // PageLoadingContext defaults to a 1s footer-reveal timer for non-video-hero
  // routes. The catena sections render inline, so signal ready on mount to
  // avoid the lingering footer-hidden state (mirrors PadoPage).
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
    <main className="dev-home-catena gostop-theme" data-theme="dark">
      <JsonLd data={GOSTOP_APP_SCHEMA} />
      <ErrorBoundary fallback={errorFallback}>
        <GostopSection />
      </ErrorBoundary>
    </main>
  );
}
