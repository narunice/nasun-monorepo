import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './components/theme/ThemeProvider'
import './index.css'

// Lazy load App to ensure it (and its wallet dependencies) are loaded in a separate chunk
// This prevents SES lockdown from occurring before React initializes
const App = lazy(() => import('./App.tsx'))

// Lazy load wallet components to avoid SES lockdown conflict with React
const WalletProvider = lazy(() =>
  import('@nasun/wallet-ui').then((mod) => ({ default: mod.WalletProvider }))
)

// Deferred wallet initialization component
function WalletInitializer({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    // Dynamically import and configure wallet after React has mounted
    Promise.all([
      import('@nasun/wallet'),
    ]).then(([walletModule]) => {
      walletModule.configureWallet({
        rpcUrl: import.meta.env.VITE_SUI_RPC_URL || 'https://rpc.devnet.nasun.io',
        faucetUrl: import.meta.env.VITE_FAUCET_URL || 'https://faucet.devnet.nasun.io',
        sessionPersist: true,
      })

      // Initialize zkLogin (Google OAuth)
      const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
      const saltApiUrl = import.meta.env.VITE_ZKLOGIN_SALT_API_URL

      if (googleClientId && saltApiUrl) {
        walletModule.initZkLogin({
          saltApiUrl,
          proverUrl: import.meta.env.VITE_ZKLOGIN_PROVER_URL,
          providers: {
            google: {
              provider: 'google',
              clientId: googleClientId,
              redirectUri: `${window.location.origin}/callback`,
            },
          },
        })
      }

      setInitialized(true)
    })
  }, [])

  if (!initialized) {
    return (
      <div className="min-h-screen bg-nasun-c6 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-nasun-c6 flex items-center justify-center">
          <div className="text-white">Loading wallet...</div>
        </div>
      }
    >
      <WalletProvider>{children}</WalletProvider>
    </Suspense>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 1000,
      refetchInterval: 30 * 1000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletInitializer>
        <ThemeProvider defaultTheme="dark" storageKey="nasun-explorer-theme">
          <BrowserRouter>
            <Suspense
              fallback={
                <div className="min-h-screen bg-nasun-c6 flex items-center justify-center">
                  <div className="text-white">Loading application...</div>
                </div>
              }
            >
              <App />
            </Suspense>
          </BrowserRouter>
        </ThemeProvider>
      </WalletInitializer>
    </QueryClientProvider>
  </StrictMode>,
)