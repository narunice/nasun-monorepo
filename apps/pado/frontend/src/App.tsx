/**
 * Pado - DEX Trading App
 * App 컴포넌트: 레이아웃 + 라우팅만 담당
 */

import { useEffect } from 'react';
import { registerTokenFaucet } from '@nasun/wallet';
import { Header } from './components/layout';
import { AppRoutes } from './routes';
import { NETWORK_CONFIG } from './config/network';
import { useTrading } from './features/trading/useTrading';

export default function App() {
  const { requestNbtc, requestNusdc } = useTrading();

  // Register NBTC/NUSDC faucet handlers (requires wallet signing)
  useEffect(() => {
    registerTokenFaucet('NBTC', {
      request: async () => {
        const result = await requestNbtc();
        return result.success;
      },
    });
    registerTokenFaucet('NUSDC', {
      request: async () => {
        const result = await requestNusdc();
        return result.success;
      },
    });
  }, [requestNbtc, requestNusdc]);

  return (
    <div className="min-h-screen bg-theme-bg-primary text-theme-text-primary">
      <Header />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <AppRoutes />

        {/* Network Info */}
        <div className="mt-8 text-center text-sm text-theme-text-muted">
          <p>Connected to Nasun Devnet</p>
          <p className="font-mono text-xs">{NETWORK_CONFIG.rpcUrl}</p>
        </div>
      </main>
    </div>
  );
}
