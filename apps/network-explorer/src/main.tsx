import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletProvider } from '@nasun/wallet-ui'
import { configureWallet, initZkLogin } from '@nasun/wallet'
import { ThemeProvider } from './components/theme/ThemeProvider'
import './index.css'
import App from './App.tsx'

// Configure wallet for Nasun Devnet
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
        redirectUri: `${window.location.origin}/callback`,
      },
    },
  })
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
      <WalletProvider>
        <ThemeProvider defaultTheme="dark" storageKey="nasun-explorer-theme">
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ThemeProvider>
      </WalletProvider>
    </QueryClientProvider>
  </StrictMode>,
)
