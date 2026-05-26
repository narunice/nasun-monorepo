import ErrorBoundary from "@/components/layout/ErrorBoundary";
import DevHomeHeroSection from "@/sections/dev/home/DevHomeHeroSection";
import DevHomeAuthoritySection from "@/sections/dev/home/DevHomeAuthoritySection";
import DevAboutGravitySection from "@/sections/dev/about/DevAboutGravitySection";
import DevHomeNasunAppSection from "@/sections/dev/home/DevHomeNasunAppSection";
import DevHomeEcosystemSection from "@/sections/dev/home/DevHomeEcosystemSection";
import "@/sections/dev/home/dev-home.css";
import "@/sections/dev/about/dev-about.css";

export default function DevHomePage() {
  const errorFallback = (
    <div className="ch-section">
      <div className="ch-container">
        <p>Failed to load section</p>
      </div>
    </div>
  );

  return (
    <main id="main-content" className="dev-home-catena" data-theme="dark">
      <ErrorBoundary fallback={errorFallback}>
        <DevHomeHeroSection />
        <DevHomeAuthoritySection />
        <DevAboutGravitySection />
        <DevHomeNasunAppSection />
        <DevHomeEcosystemSection />
      </ErrorBoundary>
    </main>
  );
}
