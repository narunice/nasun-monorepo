import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import DevAboutHeroSection from "@/sections/dev/about/DevAboutHeroSection";
import DevHomeMechanismSection from "@/sections/dev/home/DevHomeMechanismSection";
import DevAboutNetworkSection from "@/sections/dev/about/DevAboutNetworkSection";
import DevAboutGrantsSection from "@/sections/dev/about/DevAboutGrantsSection";
import DevAboutTeamSection from "@/sections/dev/about/DevAboutTeamSection";
import "@/sections/dev/home/dev-home.css";
import "@/sections/dev/about/dev-about.css";

export default function DevAboutPage() {
  const { hash } = useLocation();

  // react-router does not auto-scroll on hash navigation. When the route
  // is entered with #section-id (e.g. "Back to Awards & Grants" from a
  // news-events post), defer one frame so the section has painted, then
  // scroll it into view. The CSS `scroll-margin-top` on .ch-section
  // keeps the landing clear of the sticky nav.
  useEffect(() => {
    if (!hash) return;
    const id = hash.replace(/^#/, "");
    if (!id) return;
    const tick = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(tick);
  }, [hash]);

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
        <DevHomeMechanismSection />
        <DevAboutNetworkSection />
        <DevAboutGrantsSection />
        <DevAboutTeamSection />
      </ErrorBoundary>
    </main>
  );
}
