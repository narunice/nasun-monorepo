/**
 * Pado Wallet Module - Compatibility Layer
 *
 * This file re-exports from @nasun/wallet for backwards compatibility.
 * Direct imports from @nasun/wallet are preferred.
 *
 * @deprecated Import directly from '@nasun/wallet' instead of './wallet'
 */

// Re-export everything from @nasun/wallet
export {
  // Hooks
  useWallet,
  useWalletStatus,
  useWalletAccount,
  useWalletLoading,

  // Crypto utilities
  generateMnemonicPhrase,
  isValidMnemonic,

  // SUI utilities
  configureWallet,
  getWalletConfig,
  getSuiClient,
  getBalance,
  formatBalance,
  parseAmount,
  isValidAddress,
  shortenAddress,
  requestFaucet,
  checkFaucetAvailable,
} from '@nasun/wallet';

// Re-export types from @nasun/wallet
export type {
  WalletStatus,
  EncryptedKeystore,
  WalletAccount,
  WalletState,
  WalletActions,
  WalletContextType,
  TransactionRequest,
  TransactionResult,
  FaucetResponse,
  BalanceInfo,
  WalletConfig,
} from '@nasun/wallet';

// Pado-specific: Multi-token balance hook (not in @nasun/wallet)
export { useBalance, useNasunBalance } from './hooks/useBalance';
export type { TokenBalance, Balances } from './hooks/useBalance';
