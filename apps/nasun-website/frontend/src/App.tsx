// App.tsx
import { useEffect, lazy, Suspense } from "react";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter as Router, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Navbar from "./components/navbar/Navbar";
import Footer from "./components/layout/Footer";
import AppRoutes from "./routes/AppRoutes";
import { HomePageLoadingProvider, useHomePageLoading } from "./contexts/PageLoadingContext";
import ErrorBoundary from "./components/layout/ErrorBoundary";
import { Button } from "./components/ui/button";
import { useReferralCapture } from "./hooks/useReferralCapture";
import { useCrossAppArrival } from "./hooks/useCrossAppArrival";

const ChatWidget = lazy(() => import("./features/chat/components/ChatWidget"));

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
  useReferralCapture();
  useCrossAppArrival();
  const isAdminPage = location.pathname.startsWith('/admin');
  const isClaimPage = location.pathname === '/claim' || location.pathname.startsWith('/claim/');

  // Disable browser's auto scroll restoration
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // Hide Footer on admin pages
  return (
    <>
      {!isClaimPage && (
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-nasun-white focus:text-nasun-black focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg"
        >
          Skip to main content
        </a>
      )}
      {!isClaimPage && <Navbar />}
      <main id="main-content" className={!isClaimPage ? "pt-14" : ""}>
        <AppRoutes />
        {isPageReady && !isAdminPage && !isClaimPage && <Footer />}
      </main>
      {!isClaimPage && (
        <Suspense fallback={null}>
          <ChatWidget />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <div className="min-h-screen bg-nasun-black overflow-x-clip">
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
