/**
 * Pado - DEX Trading App
 * App 컴포넌트: 레이아웃 + 라우팅만 담당
 */

import { useEffect, useSyncExternalStore, useCallback } from 'react';
import { registerTokenFaucet } from '@nasun/wallet';
import { MnemonicBackup } from '@nasun/wallet-ui';
import { Header } from './components/layout';
import { AppRoutes } from './routes';
import { useTrading } from './features/trading/useTrading';

// ============================================
// Mnemonic Backup Modal (App-level)
// Renders independently of WalletConnect lifecycle.
// WalletConnect stores mnemonic in sessionStorage on creation;
// this modal reads it and shows the backup screen.
// ============================================
const BACKUP_KEY = "nasun_wallet_backup_pending";
const MNEMONIC_KEY = "nasun_wallet_pending_mnemonic";

function subscribeBackup(cb: () => void) {
  const id = setInterval(cb, 100);
  return () => clearInterval(id);
}

function getBackupSnapshot(): string | null {
  try {
    if (localStorage.getItem(BACKUP_KEY) !== "true") return null;
    return sessionStorage.getItem(MNEMONIC_KEY);
  } catch {
    return null;
  }
}

function MnemonicBackupModal() {
  const mnemonic = useSyncExternalStore(subscribeBackup, getBackupSnapshot);

  const handleConfirm = useCallback(() => {
    try {
      localStorage.removeItem(BACKUP_KEY);
      sessionStorage.removeItem(MNEMONIC_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  if (!mnemonic) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
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
      <Header />

      {/* Main Content - No max-width for full-width trading experience */}
      <main className="px-3 sm:px-4 py-4 sm:py-6">
        <AppRoutes />
      </main>

      {/* App-level mnemonic backup modal - independent of page/component lifecycle */}
      <MnemonicBackupModal />
    </div>
  );
}
