/**
 * Nasun Wallet Provider
 * Wallet initialization and global state
 */

import { useEffect, type ReactNode } from 'react';
import { useWallet } from '@nasun/wallet';
import { AddressBookSyncSetup } from '../sync/AddressBookSyncSetup';

interface WalletProviderProps {
  children: ReactNode;
  /** Wallet API endpoint for address book sync. When provided, sync is enabled automatically. */
  addressBookApiEndpoint?: string;
}

/**
 * Internal component for wallet initialization
 */
function WalletInitializer({ children, addressBookApiEndpoint }: { children: ReactNode; addressBookApiEndpoint?: string }) {
  const _initialize = useWallet((state) => state._initialize);

  useEffect(() => {
    // Initialize wallet state on app start
    _initialize();
  }, [_initialize]);

  return (
    <>
      {addressBookApiEndpoint && <AddressBookSyncSetup apiEndpoint={addressBookApiEndpoint} />}
      {children}
    </>
  );
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
export function WalletProvider({ children, addressBookApiEndpoint }: WalletProviderProps) {
  return <WalletInitializer addressBookApiEndpoint={addressBookApiEndpoint}>{children}</WalletInitializer>;
}
