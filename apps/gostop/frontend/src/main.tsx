import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { configureWallet, registerTokens } from '@nasun/wallet'
import { WalletProvider } from '@nasun/wallet-ui'
import App from './App.tsx'
import { ToastProvider } from './components/ui/Toast'
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
            <App />
          </WalletProvider>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
