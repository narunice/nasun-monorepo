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

      {/* Main Content - No max-width for full-width trading experience */}
      <main className="px-3 sm:px-4 py-4 sm:py-6">
        <AppRoutes />
      </main>
    </div>
  );
}
