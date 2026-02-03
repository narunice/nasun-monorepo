/**
 * Pado - Main Entry Point
 * 전역 Provider들을 여기서 구성
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureWallet, initZkLogin, registerTokens } from '@nasun/wallet';
import { WalletProvider } from '@nasun/wallet-ui';

import { ThemeProvider } from './providers/theme';
import { ErrorBoundary } from './components/layout';
import { ToastProvider } from './components/common';
import { MarketProvider } from './features/trading/context';
import { validateEnvWithWarning, logEnvSummary } from './utils';
import { NETWORK_CONFIG, TOKENS } from './config/network';
import App from './App';
import './index.css';

// 환경변수 검증 (개발 모드에서 경고 출력)
validateEnvWithWarning();
logEnvSummary();

// Register tokens from environment variables
// This allows token addresses to be updated without modifying package code
registerTokens([
  {
    symbol: 'NBTC',
    name: 'Nasun BTC',
    decimals: TOKENS.NBTC.decimals,
    type: TOKENS.NBTC.type, // from VITE_NBTC_TYPE
  },
  {
    symbol: 'NUSDC',
    name: 'Nasun USDC',
    decimals: TOKENS.NUSDC.decimals,
    type: TOKENS.NUSDC.type, // from VITE_NUSDC_TYPE
  },
]);

// Configure wallet with Nasun network
configureWallet({
  rpcUrl: NETWORK_CONFIG.rpcUrl,
  faucetUrl: NETWORK_CONFIG.faucetUrl,
  sessionPersist: true, // Keep wallet unlocked during browser session
});

// Note: NASUN faucet is auto-registered by @nasun/wallet package
// NBTC/NUSDC faucet handlers are registered in App.tsx (requires wallet signing)

// Configure zkLogin (Phase 9: Smart Account v2)
// Enables seedless onboarding via Google OAuth
if (NETWORK_CONFIG.zkLoginSaltApiUrl && NETWORK_CONFIG.googleClientId) {
  initZkLogin({
    saltApiUrl: NETWORK_CONFIG.zkLoginSaltApiUrl,
    // Custom prover URL (if not set, defaults to Mysten Labs prover)
    ...(NETWORK_CONFIG.zkLoginProverUrl && { proverUrl: NETWORK_CONFIG.zkLoginProverUrl }),
    providers: {
      google: {
        provider: 'google',
        clientId: NETWORK_CONFIG.googleClientId,
        redirectUri: `${window.location.origin}/callback`,
      },
    },
  });
} else if (import.meta.env.DEV) {
  console.warn('[zkLogin] Not initialized - missing environment variables');
}

// React Query 클라이언트
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <WalletProvider>
                <MarketProvider>
                  <App />
                </MarketProvider>
              </WalletProvider>
            </ToastProvider>
          </QueryClientProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
