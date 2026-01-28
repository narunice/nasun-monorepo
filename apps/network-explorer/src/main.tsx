/**
 * Network Explorer - Main Entry Point
 * Uses the same static import pattern as other apps (pado, baram, nasun-website)
 */

import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureWallet, initZkLogin } from '@nasun/wallet'
import { WalletProvider } from '@nasun/wallet-ui'
import { ThemeProvider } from './components/theme/ThemeProvider'
import './index.css'

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
const App = lazy(() => import('./App.tsx'))

// React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 1000,
      refetchInterval: 30 * 1000,
    },
  },
})

// Loading fallback
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-nasun-c6 flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <ThemeProvider defaultTheme="dark" storageKey="nasun-explorer-theme">
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
