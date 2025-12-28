/**
 * @nasun/wallet - Nasun Wallet Core Package
 *
 * Usage:
 * ```tsx
 * import { useWallet, useBalance, configureWallet } from '@nasun/wallet';
 *
 * // Configure wallet (optional, defaults to Nasun Devnet)
 * configureWallet({
 *   rpcUrl: 'https://rpc.devnet.nasun.io',
 *   faucetUrl: 'https://faucet.devnet.nasun.io',
 * });
 *
 * // Use wallet hooks
 * const { status, account, createWallet, unlockWallet } = useWallet();
 * const { data: balance } = useBalance();
 *
 * // Multi-token support
 * import { registerToken, useMultiBalance } from '@nasun/wallet';
 *
 * registerToken({ symbol: 'NBTC', name: 'NBTC', decimals: 8, type: '0x...' });
 * const { data: balances } = useMultiBalance();
 * ```
 */

// Hooks
export {
  useWallet,
  useWalletStatus,
  useWalletAccount,
  useWalletLoading,
} from './hooks/useWallet';

export {
  useBalance,
  useRefreshBalance,
  useInvalidateBalance,
} from './hooks/useBalance';

export { useTransaction } from './hooks/useTransaction';
export { useTokenTransaction } from './hooks/useTokenTransaction';

// Multi-token hooks
export {
  useMultiBalance,
  useTokenBalance,
  useNativeBalance,
  useRefreshMultiBalance,
  useInvalidateMultiBalance,
} from './hooks/useMultiBalance';
export type { UseMultiBalanceOptions } from './hooks/useMultiBalance';

// Types
export type {
  WalletStatus,
  WalletState,
  WalletActions,
  WalletAccount,
  WalletContextType,
  EncryptedKeystore,
  TransactionRequest,
  TransactionResult,
  FaucetResponse,
  BalanceInfo,
  WalletConfig,
  // Multi-token types
  TokenConfig,
  TokenBalance,
  MultiTokenBalanceInfo,
} from './types';

// SUI Utilities
export {
  configureWallet,
  getWalletConfig,
  getSuiClient,
  getBalance,
  formatBalance,
  parseAmount,
  isValidAddress,
  shortenAddress,
  // Multi-token utilities
  getAllBalances,
  getTokenBalance,
  // Session persistence utilities
  isSessionPersistEnabled,
  saveSessionPassword,
  getSessionPassword,
  clearSessionPassword,
} from './sui/client';

export {
  requestFaucet,
  checkFaucetAvailable,
} from './sui/faucet';

// Token Registry
export {
  NATIVE_TOKEN,
  registerToken,
  registerTokens,
  getToken,
  getTokenByType,
  getAllTokens,
  isTokenRegistered,
  clearTokens,
} from './config/tokens';

// Crypto utilities
export {
  generateMnemonicPhrase,
  isValidMnemonic,
} from './core/crypto';
