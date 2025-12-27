/**
 * Nasun Wallet Public API
 *
 * 사용법:
 * ```tsx
 * import { WalletProvider, WalletConnect, BalanceDisplay, useWallet, useBalance } from './wallet';
 *
 * // App.tsx
 * <WalletProvider>
 *   <App />
 * </WalletProvider>
 *
 * // Header.tsx
 * <WalletConnect />
 * <BalanceDisplay compact />
 *
 * // 지갑 상태 사용
 * const { status, account, lockWallet } = useWallet();
 *
 * // 잔액 조회
 * const { data: balance } = useBalance();
 * ```
 */

// Components
export { WalletProvider } from './components/WalletProvider';
export { WalletConnect } from './components/WalletConnect';
export { BalanceDisplay } from './components/BalanceDisplay';
export { SendTransaction } from './components/SendTransaction';
export { FaucetButton } from './components/FaucetButton';
export { MnemonicBackup } from './components/MnemonicBackup';
export { ImportWallet } from './components/ImportWallet';
export { ExportPrivateKey } from './components/ExportPrivateKey';

// Hooks
export { useWallet, useWalletStatus, useWalletAccount, useWalletLoading } from './hooks/useWallet';
export { useBalance, useRefreshBalance, useInvalidateBalance } from './hooks/useBalance';
export { useTransaction } from './hooks/useTransaction';

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
} from './types/wallet';

// Utilities (필요 시 사용)
export {
  formatBalance,
  parseAmount,
  isValidAddress,
  shortenAddress,
} from './lib/sui-client';

// Crypto utilities (필요 시 사용)
export {
  generateMnemonicPhrase,
  isValidMnemonic,
} from './lib/crypto';
