/**
 * Network Explorer Wallet - Compatibility Layer
 *
 * @deprecated Import directly from '@nasun/wallet' or '@nasun/wallet-ui' instead
 */

// Re-export from @nasun/wallet
export {
  // Hooks
  useWallet,
  useWalletStatus,
  useWalletAccount,
  useWalletLoading,
  useBalance,
  useRefreshBalance,
  useInvalidateBalance,
  useTransaction,

  // Utilities
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

  // Crypto
  generateMnemonicPhrase,
  isValidMnemonic,
} from '@nasun/wallet';

// Re-export types from @nasun/wallet
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
} from '@nasun/wallet';

// Re-export from @nasun/wallet-ui
export {
  WalletProvider,
  WalletConnect,
  BalanceDisplay,
  SendTransaction,
  FaucetButton,
  MnemonicBackup,
  ImportWallet,
  ExportPrivateKey,
} from '@nasun/wallet-ui';
