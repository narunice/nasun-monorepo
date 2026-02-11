/**
 * Pado - DEX Trading App
 * App 컴포넌트: 레이아웃 + 라우팅만 담당
 */

import { useEffect } from 'react';
import { registerTokenFaucet } from '@nasun/wallet';
import { Header, MobileBottomNav } from './components/layout';
import { AppRoutes } from './routes';
import { useTrading } from './features/trading/useTrading';
import { waitForTxIndexing } from './lib/tx-helpers';
import { OfflineBanner } from './components/common/OfflineBanner';

export default function App() {
  const { requestNbtc, requestNusdc } = useTrading();

  // Register NBTC/NUSDC faucet handlers (requires wallet signing)
  // waitForTxIndexing ensures RPC has indexed the tx before wallet-ui refreshes balance
  useEffect(() => {
    registerTokenFaucet('NBTC', {
      request: async () => {
        const result = await requestNbtc();
        if (result.success && result.digest) {
          await waitForTxIndexing(result.digest);
        }
        return result.success;
      },
    });
    registerTokenFaucet('NUSDC', {
      request: async () => {
        const result = await requestNusdc();
        if (result.success && result.digest) {
          await waitForTxIndexing(result.digest);
        }
        return result.success;
      },
    });
  }, [requestNbtc, requestNusdc]);

  return (
    <div className="min-h-screen bg-theme-bg-primary text-theme-text-primary">
      <OfflineBanner />
      <Header />

      {/* Main Content - No max-width for full-width trading experience */}
      {/* pb-16 on mobile reserves space for MobileBottomNav (56px + safe area) */}
      <main className="px-3 sm:px-4 py-4 sm:py-6 pb-20 md:pb-6">
        <AppRoutes />
      </main>

      {/* Mobile bottom navigation bar (< md) */}
      <MobileBottomNav />
    </div>
  );
}
