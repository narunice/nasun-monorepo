/**
 * Pado - DEX Trading App
 * App 컴포넌트: 레이아웃 + 라우팅만 담당
 */

import { useEffect, useSyncExternalStore, useCallback } from 'react';
import { registerTokenFaucet, consumePendingMnemonic, hasPendingMnemonic } from '@nasun/wallet';
import { MnemonicBackup } from '@nasun/wallet-ui';
import { Header, MobileBottomNav } from './components/layout';
import { AppRoutes } from './routes';
import { useTrading } from './features/trading/useTrading';
import { OfflineBanner } from './components/common/OfflineBanner';

// ============================================
// Mnemonic Backup Modal (App-level)
// Renders independently of WalletConnect lifecycle.
// useWallet stores mnemonic in memory on creation;
// this modal reads it once and shows the backup screen.
// ============================================
const BACKUP_KEY = "nasun_wallet_backup_pending";

function subscribeBackup(cb: () => void) {
  const id = setInterval(cb, 100);
  return () => clearInterval(id);
}

function getBackupSnapshot(): string | null {
  try {
    if (localStorage.getItem(BACKUP_KEY) !== "true") return null;
    return hasPendingMnemonic() ? "pending" : null;
  } catch {
    return null;
  }
}

function MnemonicBackupModal() {
  const hasMnemonic = useSyncExternalStore(subscribeBackup, getBackupSnapshot);
  const mnemonic = hasMnemonic ? consumePendingMnemonic() : null;

  const handleConfirm = useCallback(() => {
    try {
      localStorage.removeItem(BACKUP_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  if (!mnemonic) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-pd5 dark:bg-pd0s rounded-xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
        <MnemonicBackup mnemonic={mnemonic} onConfirm={handleConfirm} />
      </div>
    </div>
  );
}

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
      <OfflineBanner />
      <Header />

      {/* Main Content - No max-width for full-width trading experience */}
      {/* pb-16 on mobile reserves space for MobileBottomNav (56px + safe area) */}
      <main className="px-3 sm:px-4 py-4 sm:py-6 pb-20 md:pb-6">
        <AppRoutes />
      </main>

      {/* Mobile bottom navigation bar (< md) */}
      <MobileBottomNav />

      {/* App-level mnemonic backup modal - independent of page/component lifecycle */}
      <MnemonicBackupModal />
    </div>
  );
}
