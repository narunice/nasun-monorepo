// App.tsx
import { useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter as Router, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Navbar from "./components/navbar/Navbar";
import Footer from "./components/layout/Footer";
import AppRoutes from "./routes/AppRoutes";
import { HomePageLoadingProvider, useHomePageLoading } from "./contexts/PageLoadingContext";
import ErrorBoundary from "./components/layout/ErrorBoundary";
import { Button } from "./components/ui/button";
import {
  configureAddressBookSync,
  resetAddressBookSyncConfig,
  useAddressBookSync,
  AddressBookSessionManager,
  useSigner,
} from "@nasun/wallet";
import type { ZkLoginSigner } from "@nasun/wallet";

const WALLET_API_ENDPOINT = import.meta.env.VITE_WALLET_API_ENDPOINT as string;

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

/**
 * Sets up address book sync with wallet-signature-based session tokens.
 * Reconfigures when signer changes (wallet connect/disconnect/switch).
 */
function AddressBookSyncSetup() {
  const { signer, address: walletAddress, signerType } = useSigner();

  useEffect(() => {
    if (!signer || !walletAddress || !WALLET_API_ENDPOINT) {
      resetAddressBookSyncConfig();
      return;
    }

    const isZkLogin = signerType === 'zklogin';

    const session = new AddressBookSessionManager({
      apiEndpoint: WALLET_API_ENDPOINT,
      getWalletAddress: () => walletAddress,
      signMessage: async (msg: Uint8Array) => {
        if (isZkLogin) {
          const zkSigner = signer as unknown as ZkLoginSigner;
          const result = await zkSigner.signWithEphemeralKey(msg);
          return result.signature;
        }
        const result = await signer.signPersonal(msg);
        return result.signature;
      },
      getEphemeralPublicKey: isZkLogin
        ? () => (signer as unknown as ZkLoginSigner).getEphemeralPublicKey()
        : undefined,
    });

    configureAddressBookSync({
      apiEndpoint: WALLET_API_ENDPOINT,
      getToken: () => session.getToken(),
    });

    return () => {
      session.invalidate();
      resetAddressBookSyncConfig();
    };
  }, [signer, walletAddress, signerType]);

  useAddressBookSync({ userId: walletAddress ?? null });

  return null;
}

function AppContent() {
  const { isPageReady } = useHomePageLoading();
  const location = useLocation();
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
      <AddressBookSyncSetup />
      {!isClaimPage && (
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-nasun-white focus:text-nasun-black focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg"
        >
          Skip to main content
        </a>
      )}
      {!isClaimPage && <Navbar />}
      <AppRoutes />
      {isPageReady && !isAdminPage && !isClaimPage && <Footer />}
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
