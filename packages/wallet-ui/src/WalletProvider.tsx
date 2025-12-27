/**
 * Nasun Wallet Provider
 * Wallet initialization and global state
 */

import { useEffect, type ReactNode } from 'react';
import { useWallet } from '@nasun/wallet';

interface WalletProviderProps {
  children: ReactNode;
}

/**
 * Internal component for wallet initialization
 */
function WalletInitializer({ children }: { children: ReactNode }) {
  const _initialize = useWallet((state) => state._initialize);

  useEffect(() => {
    // Initialize wallet state on app start
    _initialize();
  }, [_initialize]);

  return <>{children}</>;
}

/**
 * WalletProvider
 * Enables wallet functionality at the app root
 *
 * Usage:
 * ```tsx
 * <WalletProvider>
 *   <App />
 * </WalletProvider>
 * ```
 */
export function WalletProvider({ children }: WalletProviderProps) {
  return <WalletInitializer>{children}</WalletInitializer>;
}
