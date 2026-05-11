/**
 * Network Explorer - Main Entry Point
 * Uses the same static import pattern as other apps (pado, baram, nasun-website)
 */

import { StrictMode, Suspense } from 'react'
import { lazyWithRetry } from './utils/lazyWithRetry'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { toast } from 'sonner'
import { configureWallet, initZkLogin } from '@nasun/wallet'
import { WalletProvider } from '@nasun/wallet-ui'
import { ThemeProvider } from './components/theme/ThemeProvider'
import { startVersionCheck } from '../../_shared/version-check'
import './index.css'

// Auto-reload on new deploy. Polls /version.json (built by viteVersionPlugin)
// and reloads at the next safe moment (tab focus, idle, route change).
// Disabled in dev so HMR works without interference.
if (import.meta.env.PROD) {
  startVersionCheck({
    endpoint: `${import.meta.env.BASE_URL}version.json`,
  })
}

// Configure wallet with Nasun network (static, before React renders)
configureWallet({
  rpcUrl: import.meta.env.VITE_SUI_RPC_URL || 'https://rpc.devnet.nasun.io',
  faucetUrl: import.meta.env.VITE_FAUCET_URL || 'https://faucet.devnet.nasun.io',
  sessionPersist: true,
})

// Initialize zkLogin (Google OAuth)
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const saltApiUrl = import.meta.env.VITE_ZKLOGIN_SALT_API_URL

if (googleClientId && saltApiUrl) {
  initZkLogin({
    saltApiUrl,
    proverUrl: import.meta.env.VITE_ZKLOGIN_PROVER_URL,
    providers: {
      google: {
        provider: 'google',
        clientId: googleClientId,
        redirectUri: `${window.location.origin}${import.meta.env.BASE_URL}callback`,
      },
    },
  })
}

// Lazy load App for code splitting (not for SES workaround)
const App = lazyWithRetry(() => import('./App.tsx'))

// Deduplicate error toasts — show at most one per 30s
let lastErrorToast = 0;
function showErrorToast(message: string) {
  const now = Date.now();
  if (now - lastErrorToast < 30_000) return;
  lastErrorToast = now;
  toast.error(message);
}

// React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 1000,
      refetchInterval: 30 * 1000,
    },
    mutations: {
      onError: (error) => {
        showErrorToast(error instanceof Error ? error.message : 'Request failed');
      },
    },
  },
  queryCache: new QueryCache({
    onError: (_error, query) => {
      // Only show toast for queries that have already loaded data (background refetch failures)
      // Skip initial load failures — those show inline error states
      if (query.state.data !== undefined) {
        showErrorToast('Failed to refresh data. Retrying...');
      }
    },
  }),
})

// Loading fallback
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-ne0 flex items-center justify-center">
      <div className="text-ne5">Loading...</div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletProvider addressBookApiEndpoint={import.meta.env.VITE_WALLET_API_ENDPOINT}>
        <ThemeProvider defaultTheme="light" storageKey="nasun-explorer-theme">
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <Suspense fallback={<LoadingScreen />}>
              <App />
            </Suspense>
          </BrowserRouter>
        </ThemeProvider>
      </WalletProvider>
    </QueryClientProvider>
  </StrictMode>,
)
