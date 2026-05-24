import ErrorBoundary from "@/components/layout/ErrorBoundary";
import DevHomeHeroSection from "@/sections/dev/home/DevHomeHeroSection";
import DevHomeAuthoritySection from "@/sections/dev/home/DevHomeAuthoritySection";
import DevHomeMechanismSection from "@/sections/dev/home/DevHomeMechanismSection";
import DevHomeNasunAppSection from "@/sections/dev/home/DevHomeNasunAppSection";
import DevHomeOperationalSignalSection from "@/sections/dev/home/DevHomeOperationalSignalSection";
import DevHomeEcosystemSection from "@/sections/dev/home/DevHomeEcosystemSection";
import DevHomeTokenSection from "@/sections/dev/home/DevHomeTokenSection";
import "@/sections/dev/home/dev-home.css";

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
        <DevHomeMechanismSection />
        <DevHomeNasunAppSection />
        <DevHomeOperationalSignalSection />
        <DevHomeEcosystemSection />
        <DevHomeTokenSection />
      </ErrorBoundary>
    </main>
  );
}
