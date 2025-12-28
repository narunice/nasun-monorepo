/**
 * Nasun Wallet Type Definitions
 */

// Wallet status
export type WalletStatus = 'disconnected' | 'locked' | 'unlocked';

// Encrypted keystore
export interface EncryptedKeystore {
  // Encrypted private key (base64)
  encryptedPrivateKey: string;
  // AES-GCM IV (base64)
  iv: string;
  // PBKDF2 salt (base64)
  salt: string;
  // Public address
  address: string;
  // Creation time
  createdAt: number;
}

// Wallet account
export interface WalletAccount {
  address: string;
  publicKey: string;
}

// Wallet context state
export interface WalletState {
  status: WalletStatus;
  account: WalletAccount | null;
  isLoading: boolean;
  error: string | null;
}

// Wallet context actions
export interface WalletActions {
  // Create new wallet (random)
  createWallet: (password: string) => Promise<string>;
  // Create new wallet (with mnemonic backup)
  createWalletWithBackup: (password: string) => Promise<{ address: string; mnemonic: string }>;
  // Unlock existing wallet
  unlockWallet: (password: string) => Promise<void>;
  // Lock wallet
  lockWallet: () => void;
  // Delete wallet
  deleteWallet: () => void;
  // Import from mnemonic
  importWallet: (mnemonic: string, password: string) => Promise<string>;
  // Import from mnemonic (explicit method)
  importFromMnemonic: (mnemonic: string, password: string) => Promise<string>;
  // Import from private key
  importFromPrivateKey: (privateKey: string, password: string) => Promise<string>;
  // Export private key (requires password)
  exportPrivateKey: (password: string) => Promise<string>;
  // Clear error
  clearError: () => void;
}

// Full wallet context
export interface WalletContextType extends WalletState, WalletActions {}

// Transaction request (native token only)
export interface TransactionRequest {
  to: string;
  amount: string; // NASUN unit
}

// Token transaction request (any token)
export interface TokenTransactionRequest {
  to: string;
  amount: string; // Display unit (will be converted based on decimals)
  tokenType: string; // Coin type (e.g., '0x2::sui::SUI', '0xabc::nbtc::NBTC')
}

// Transaction result
export interface TransactionResult {
  digest: string;
  status: 'success' | 'failure';
  gasUsed?: string;
  error?: string;
  // For token transactions
  tokenType?: string;
  amount?: string;
}

// Faucet response
export interface FaucetResponse {
  transferredGasObjects: Array<{
    id: string;
    amount: number;
  }>;
  error?: string;
}

// Balance info
export interface BalanceInfo {
  totalBalance: string; // SOE unit (minimum unit)
  formattedBalance: string; // NASUN unit (display)
  coinCount: number;
}

// Wallet configuration
export interface WalletConfig {
  rpcUrl: string;
  faucetUrl?: string;
  networkName?: string;
  /** Explorer base URL for transaction links (e.g., 'https://explorer.devnet.nasun.io') */
  explorerUrl?: string;
  /** Persist session across page refreshes (stores password in sessionStorage) */
  sessionPersist?: boolean;
}

// ============================================
// Multi-Token Support Types
// ============================================

// Token configuration
export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  type: string; // Coin type (e.g., '0x2::sui::SUI')
  icon?: string;
}

// Individual token balance
export interface TokenBalance {
  symbol: string;
  balance: bigint;
  formatted: string;
  decimals: number;
  type: string;
}

// Multi-token balance info
export interface MultiTokenBalanceInfo {
  native: TokenBalance; // NASUN (native token)
  tokens: Record<string, TokenBalance>; // Additional tokens (symbol -> balance)
}
