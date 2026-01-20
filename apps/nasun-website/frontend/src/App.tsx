// App.tsx
import { useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter as Router, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { NFTMintedModal } from "./components/app/wave1/genesisNft/nftMintedModal/NFTMintedModal";
import Navbar from "./components/navbar/Navbar";
import Footer from "./components/layout/Footer";
import AppRoutes from "./routes/AppRoutes";
import { HomePageLoadingProvider, useHomePageLoading } from "./contexts/PageLoadingContext";
import ErrorBoundary from "./components/layout/ErrorBoundary";
import { Button } from "./components/ui/button";

/**
 * Error fallback component with i18n support
 * Displayed when an unrecoverable error occurs (non-ChunkLoadError)
 */
function ErrorFallback() {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-nasun-black text-white px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold">{t("errorPage.title")}</h1>
        <p className="text-nasun-white/70">{t("errorPage.description")}</p>
        <Button
          onClick={() => window.location.reload()}
          variant="filledOutlineC4"
          size="lg"
        >
          {t("errorPage.reload")}
        </Button>
      </div>
    </div>
  );
}

function AppContent() {
  const { isPageReady } = useHomePageLoading();
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith('/admin');

  // Disable browser's auto scroll restoration
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // Hide Footer on admin pages
  return (
    <>
      <Navbar />
      <AppRoutes />
      <NFTMintedModal />
      {isPageReady && !isAdminPage && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <div className="min-h-screen bg-nasun-black">
        <HelmetProvider>
          <Router>
            <HomePageLoadingProvider>
              <AppContent />
            </HomePageLoadingProvider>
          </Router>
        </HelmetProvider>
      </div>
    </ErrorBoundary>
  );
}
