import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import ChSection from "@/sections/dev/home/ChSection";
import FadeInUp from "@/sections/dev/home/FadeInUp";
import GenSolMainHeroSection from "@/sections/ecosystem/gensol/main/GenSolMainHeroSection";
import GenSolMainTrailerSection from "@/sections/ecosystem/gensol/main/GenSolMainTrailerSection";
import GenSolMainOverviewSection from "@/sections/ecosystem/gensol/main/GenSolMainOverviewSection";
import GenSolMainUniverseSection from "@/sections/ecosystem/gensol/main/GenSolMainUniverseSection";
import GenSolMainBuildingSection from "@/sections/ecosystem/gensol/main/GenSolMainBuildingSection";
import "@/sections/dev/home/dev-home.css";
import "@/sections/dev/about/dev-about.css";
import "@/sections/ecosystem/gensol/gensol-theme.css";

export default function GenSolMainPage() {
  const { hash } = useLocation();

  // Deep URLs like /ecosystem/gensol/main#trailer must scroll to the section
  // on mount. The global useScrollToTop hook clobbers hash jumps, so we run
  // an explicit scrollIntoView after first paint.
  useEffect(() => {
    if (!hash) return;
    const id = hash.replace(/^#/, "");
    if (!id) return;
    const tick = requestAnimationFrame(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    <main
      id="main-content"
      className="dev-home-catena gensol-theme"
      data-theme="dark"
    >
      <ErrorBoundary fallback={errorFallback}>
        <GenSolMainHeroSection />
        <GenSolMainTrailerSection />
        <GenSolMainOverviewSection />
        <GenSolMainUniverseSection />
        <GenSolMainBuildingSection />

        {/* Closing — inlined per plan §3.1 row 6 (two ch-closing-card rules). */}
        <ChSection fullMinHeight={false}>
          <div className="ch-closing-grid">
            <FadeInUp>
              <div className="ch-closing-card">
                <span className="ch-closing-eyebrow">Built for transmedia</span>
                <h3 className="ch-closing-title">
                  One canon, every medium.
                </h3>
                <p className="ch-body">
                  Games, animation, and film all share characters, factions, and
                  events. The story you play on Monday plays out on screen by
                  Friday.
                </p>
              </div>
            </FadeInUp>
            <FadeInUp>
              <div className="ch-closing-card">
                <span className="ch-closing-eyebrow">Built on Nasun</span>
                <h3 className="ch-closing-title">
                  Player records that travel with you.
                </h3>
                <p className="ch-body">
                  Tournament results, rare Spectra hauls, and ownership of
                  in-game items live onchain. Earned, portable, yours.
                </p>
              </div>
            </FadeInUp>
          </div>
        </ChSection>
      </ErrorBoundary>
    </main>
  );
}
