/**
 * Pado - Main Entry Point
 * 전역 Provider들을 여기서 구성
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ErrorBoundary } from './components/layout';
import { ToastProvider } from './components/common';
import { WalletModalProvider } from './providers';
import { validateEnvWithWarning, logEnvSummary } from './utils';
import App from './App';
import './index.css';

// 환경변수 검증 (개발 모드에서 경고 출력)
validateEnvWithWarning();
logEnvSummary();

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
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <WalletModalProvider>
              <App />
            </WalletModalProvider>
          </ToastProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
