/**
 * Blind - Private AI Computation
 * Main Entry Point
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureWallet, registerTokens } from '@nasun/wallet';
import { WalletProvider } from '@nasun/wallet-ui';

import { NETWORK_CONFIG, TOKENS } from './config/network';
import App from './App';
import './index.css';

// Register NUSDC token
registerTokens([
  {
    symbol: 'NUSDC',
    name: 'Nasun USDC',
    decimals: TOKENS.NUSDC.decimals,
    type: TOKENS.NUSDC.type,
  },
]);

// Configure wallet with Nasun network
configureWallet({
  rpcUrl: NETWORK_CONFIG.rpcUrl,
  faucetUrl: NETWORK_CONFIG.faucetUrl,
  sessionPersist: true,
});

console.log('Blind Config:', {
  network: NETWORK_CONFIG.networkName,
  rpcUrl: NETWORK_CONFIG.rpcUrl,
});

// React Query client
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
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <App />
      </WalletProvider>
    </QueryClientProvider>
  </StrictMode>
);
