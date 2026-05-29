import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import SpectraHeroSection from "@/sections/ecosystem/gensol/shooter/SpectraHeroSection";
import SpectraCoreLoopSection from "@/sections/ecosystem/gensol/shooter/SpectraCoreLoopSection";
import SpectraLoreSection from "@/sections/ecosystem/gensol/shooter/SpectraLoreSection";
import SpectraFactionsProgressSection from "@/sections/ecosystem/gensol/shooter/SpectraFactionsProgressSection";
import SpectraTechNextSection from "@/sections/ecosystem/gensol/shooter/SpectraTechNextSection";
import "@/sections/dev/home/dev-home.css";
import "@/sections/dev/about/dev-about.css";
import "@/sections/ecosystem/gensol/gensol-theme.css";

export default function GenSolShooterPage() {
  const { hash } = useLocation();

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
        <SpectraHeroSection />
        <SpectraCoreLoopSection />
        <SpectraLoreSection />
        <SpectraFactionsProgressSection />
        <SpectraTechNextSection />
      </ErrorBoundary>
    </main>
  );
}
