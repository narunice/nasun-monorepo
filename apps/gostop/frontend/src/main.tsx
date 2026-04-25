import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureWallet, initZkLogin, registerTokens } from '@nasun/wallet'
import { WalletProvider } from '@nasun/wallet-ui'
import App from './App.tsx'
import { ToastProvider } from './components/ui/Toast'
import { CelebrationProvider } from './components/celebration'
import { SoundOptInToast } from './components/celebration/SoundOptInToast'
import { GOSTOP_RPC_URL, NUSDC_TYPE } from './lib/gostop-config'
import './index.css'

registerTokens([
  {
    symbol: 'NUSDC',
    name: 'Nasun USDC',
    decimals: 6,
    type: NUSDC_TYPE,
  },
])

configureWallet({
  rpcUrl: GOSTOP_RPC_URL,
  faucetUrl: 'https://faucet.devnet.nasun.io',
  sessionPersist: true,
})

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
const zkLoginSaltApiUrl = import.meta.env.VITE_ZKLOGIN_SALT_API_URL
const zkLoginProverUrl = import.meta.env.VITE_ZKLOGIN_PROVER_URL

if (googleClientId && zkLoginSaltApiUrl) {
  initZkLogin({
    saltApiUrl: zkLoginSaltApiUrl,
    ...(zkLoginProverUrl && { proverUrl: zkLoginProverUrl }),
    providers: {
      google: {
        provider: 'google',
        clientId: googleClientId,
        redirectUri: `${window.location.origin}/callback`,
      },
    },
  })
} else if (import.meta.env.DEV) {
  console.warn('[zkLogin] Not initialized - missing VITE_GOOGLE_CLIENT_ID or VITE_ZKLOGIN_SALT_API_URL')
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <WalletProvider>
            <CelebrationProvider>
              <App />
              <SoundOptInToast />
            </CelebrationProvider>
          </WalletProvider>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
