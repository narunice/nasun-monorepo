import ErrorBoundary from "@/components/layout/ErrorBoundary";
import DevAboutHeroSection from "@/sections/dev/about/DevAboutHeroSection";
import DevAboutGravitySection from "@/sections/dev/about/DevAboutGravitySection";
import DevAboutNetworkSection from "@/sections/dev/about/DevAboutNetworkSection";
import DevAboutGrantsSection from "@/sections/dev/about/DevAboutGrantsSection";
import DevAboutTeamSection from "@/sections/dev/about/DevAboutTeamSection";
import "@/sections/dev/home/dev-home.css";
import "@/sections/dev/about/dev-about.css";

export default function DevAboutPage() {
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
        <DevAboutHeroSection />
        <DevAboutGravitySection />
        <DevAboutNetworkSection />
        <DevAboutGrantsSection />
        <DevAboutTeamSection />
      </ErrorBoundary>
    </main>
  );
}
