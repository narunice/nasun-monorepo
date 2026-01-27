/**
 * Baram - Private AI Computation
 * Main Entry Point
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Transaction } from '@mysten/sui/transactions';
import { configureWallet, registerTokens, registerTokenFaucet, initZkLogin } from '@nasun/wallet';
import { WalletProvider } from '@nasun/wallet-ui';

import { NETWORK_CONFIG, TOKENS, BARAM_CONFIG, FAUCET_CONFIG, ZKLOGIN_CONFIG } from './config/network';
import App from './App';
import './index.css';

// Register NUSDC token (baram-specific type)
registerTokens([
  {
    symbol: 'NUSDC',
    name: 'Nasun USDC',
    decimals: TOKENS.NUSDC.decimals,
    type: TOKENS.NUSDC.type,
  },
]);

// Register NUSDC faucet handler for baram package
if (FAUCET_CONFIG.tokenFaucetId) {
  registerTokenFaucet('NUSDC', {
    buildTransaction: () => {
      const tx = new Transaction();
      tx.moveCall({
        target: `${BARAM_CONFIG.packageId}::faucet::request_nusdc`,
        arguments: [
          tx.object(FAUCET_CONFIG.tokenFaucetId),
        ],
      });
      return tx;
    },
  });
}

// Configure wallet with Nasun network
configureWallet({
  rpcUrl: NETWORK_CONFIG.rpcUrl,
  faucetUrl: NETWORK_CONFIG.faucetUrl,
  sessionPersist: true,
});

// Initialize zkLogin (Google OAuth)
if (ZKLOGIN_CONFIG.googleClientId && ZKLOGIN_CONFIG.saltApiUrl) {
  initZkLogin({
    saltApiUrl: ZKLOGIN_CONFIG.saltApiUrl,
    proverUrl: ZKLOGIN_CONFIG.proverUrl,
    providers: {
      google: {
        provider: 'google',
        clientId: ZKLOGIN_CONFIG.googleClientId,
        redirectUri: `${window.location.origin}/callback`,
      },
    },
  });
  console.log('zkLogin initialized');
}

console.log('Baram Config:', {
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
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WalletProvider>
    </QueryClientProvider>
  </StrictMode>
);
