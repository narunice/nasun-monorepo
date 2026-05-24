import ErrorBoundary from "@/components/layout/ErrorBoundary";
import DevHomeOperationalSignalSection from "@/sections/dev/home/DevHomeOperationalSignalSection";
import DevHomeTokenSection from "@/sections/dev/home/DevHomeTokenSection";
import "@/sections/dev/home/dev-home.css";

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
        <DevHomeOperationalSignalSection />
        <DevHomeTokenSection />
      </ErrorBoundary>
    </main>
  );
}
