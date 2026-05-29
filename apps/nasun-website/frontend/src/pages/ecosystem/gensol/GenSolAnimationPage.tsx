import ErrorBoundary from "@/components/layout/ErrorBoundary";
import HeistHeroSection from "@/sections/ecosystem/gensol/animation/HeistHeroSection";
import HeistStorySection from "@/sections/ecosystem/gensol/animation/HeistStorySection";
import HeistCharactersSection from "@/sections/ecosystem/gensol/animation/HeistCharactersSection";
import HeistGalaxySection from "@/sections/ecosystem/gensol/animation/HeistGalaxySection";
import "@/sections/dev/home/dev-home.css";
import "@/sections/dev/about/dev-about.css";
import "@/sections/ecosystem/gensol/gensol-theme.css";

export default function GenSolAnimationPage() {
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
        <HeistHeroSection />
        <HeistStorySection />
        <HeistCharactersSection />
        <HeistGalaxySection />
      </ErrorBoundary>
    </main>
  );
}
