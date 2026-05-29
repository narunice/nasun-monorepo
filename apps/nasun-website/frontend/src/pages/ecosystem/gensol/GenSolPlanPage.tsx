import ErrorBoundary from "@/components/layout/ErrorBoundary";
import PlanHeroSection from "@/sections/ecosystem/gensol/plan/PlanHeroSection";
import PlanStructureSection from "@/sections/ecosystem/gensol/plan/PlanStructureSection";
import PlanPillarsSection from "@/sections/ecosystem/gensol/plan/PlanPillarsSection";
import PlanGamesSection from "@/sections/ecosystem/gensol/plan/PlanGamesSection";
import PlanStatusSection from "@/sections/ecosystem/gensol/plan/PlanStatusSection";
import "@/sections/dev/home/dev-home.css";
import "@/sections/dev/about/dev-about.css";
import "@/sections/ecosystem/gensol/gensol-theme.css";

export default function GenSolPlanPage() {
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
        <PlanHeroSection />
        <PlanStructureSection />
        <PlanPillarsSection />
        <PlanGamesSection />
        <PlanStatusSection />
      </ErrorBoundary>
    </main>
  );
}
