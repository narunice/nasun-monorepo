import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './components/theme/ThemeProvider'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 1000,
      refetchInterval: 30 * 1000,
    },
  },
})

// Loading screen component (no hooks, safe to render immediately)
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-nasun-c6 flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>
  )
}

// Initialize wallet and render app asynchronously
// This ensures wallet is configured BEFORE any React components using hooks are rendered
async function initializeApp() {
  // Show loading screen immediately
  const root = createRoot(document.getElementById('root')!)
  root.render(<LoadingScreen />)

  try {
    // 1. Import and configure wallet module FIRST (before any React hooks are used)
    const walletModule = await import('@nasun/wallet')
    walletModule.configureWallet({
      rpcUrl: import.meta.env.VITE_SUI_RPC_URL || 'https://rpc.devnet.nasun.io',
      faucetUrl: import.meta.env.VITE_FAUCET_URL || 'https://faucet.devnet.nasun.io',
      sessionPersist: true,
    })

    // Initialize zkLogin (Google OAuth) if configured
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

    // 2. Import UI components AFTER wallet is configured
    const [{ WalletProvider }, { default: App }] = await Promise.all([
      import('@nasun/wallet-ui'),
      import('./App.tsx'),
    ])

    // 3. Render the full app with all providers
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <WalletProvider>
            <ThemeProvider defaultTheme="dark" storageKey="nasun-explorer-theme">
              <BrowserRouter>
                <Suspense fallback={<LoadingScreen />}>
                  <App />
                </Suspense>
              </BrowserRouter>
            </ThemeProvider>
          </WalletProvider>
        </QueryClientProvider>
      </StrictMode>,
    )
  } catch (error) {
    console.error('Failed to initialize app:', error)
    root.render(
      <div className="min-h-screen bg-nasun-c6 flex items-center justify-center">
        <div className="text-red-500">Failed to load application. Please refresh the page.</div>
      </div>,
    )
  }
}

// Start the app
initializeApp()
