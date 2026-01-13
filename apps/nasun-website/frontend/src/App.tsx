// App.tsx
import { useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter as Router } from "react-router-dom";
import { NFTMintedModal } from "./components/app/wave1/genesisNft/nftMintedModal/NFTMintedModal";
import Navbar from "./components/navbar/Navbar";
import Footer from "./components/layout/Footer";
import AppRoutes from "./routes/AppRoutes";
import { HomePageLoadingProvider, useHomePageLoading } from "./contexts/PageLoadingContext";
import ErrorBoundary from "./components/layout/ErrorBoundary";

function AppContent() {
  const { isPageReady } = useHomePageLoading();

  // 브라우저의 자동 스크롤 복원 비활성화
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // 모든 페이지에서 페이지가 준비될 때까지 Footer 숨김
  return (
    <>
      <Navbar />
      <AppRoutes />
      <NFTMintedModal />
      {isPageReady && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen bg-nasun-black text-white">
          <h1 className="text-2xl font-bold mb-4">죄송합니다. 문제가 발생했습니다.</h1>
          <p className="mb-4 text-nasun-c3">페이지를 새로고침하면 문제가 해결될 수 있습니다.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-nasun-c1 text-white rounded hover:bg-nasun-c2 transition-colors"
          >
            새로고침
          </button>
        </div>
      }
    >
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
