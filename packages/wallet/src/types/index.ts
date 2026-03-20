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
  // Encrypted mnemonic (optional — absent for private-key imports and legacy wallets)
  encryptedMnemonic?: string;
  // AES-GCM IV for mnemonic (separate from private key IV)
  mnemonicIv?: string;
  // PBKDF2 salt for mnemonic (separate from private key salt)
  mnemonicSalt?: string;
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
  // Export mnemonic (requires password, null if not stored)
  exportMnemonic: (password: string) => Promise<string | null>;
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

// ============================================
// Network Types
// ============================================

/** Network type identifier */
export type NetworkType = 'devnet' | 'testnet' | 'mainnet';

/** Network configuration info */
export interface NetworkInfo {
  type: NetworkType;
  name: string;
  rpcUrl: string;
  faucetUrl?: string;
  explorerUrl?: string;
  /** Whether this network is currently enabled/available */
  enabled: boolean;
}

// Wallet configuration
export interface WalletConfig {
  rpcUrl: string;
  faucetUrl?: string;
  networkName?: string;
  /** Explorer base URL for transaction links (e.g., 'https://explorer.nasun.io/devnet') */
  explorerUrl?: string;
  /** Persist session across page refreshes (stores password in sessionStorage) */
  sessionPersist?: boolean;
  /** Network type for display purposes */
  networkType?: NetworkType;
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

// Token faucet handler for requesting test tokens
// Supports two modes:
// 1. request() - Simple HTTP API call (NASUN native faucet)
// 2. buildTransaction() - Move transaction that requires wallet signing (NBTC/NUSDC)
export interface TokenFaucetHandler {
  /** Request tokens via HTTP API. Returns true on success, throws on cooldown. */
  request?: (address: string) => Promise<boolean>;
  /** Build a Move transaction for faucet. Used for tokens that require signing. */
  buildTransaction?: () => import('@mysten/sui/transactions').Transaction;
  /** Custom success message */
  successMessage?: string;
  /** Check remaining cooldown in ms (0 = can claim). For pre-flight UI display. */
  getCooldownRemaining?: (address: string) => number;
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

// ============================================
// Security Settings Types
// ============================================

/** Security configuration for wallet auto-lock and protection */
export interface SecuritySettings {
  /** Auto-lock timeout in minutes (0 = disabled, default: 60) */
  autoLockMinutes: number;
  /** Last user activity timestamp (Date.now()) */
  lastActivityAt: number;
  /** Require password confirmation for large transactions */
  confirmLargeTransactions: boolean;
  /** Large transaction threshold in display units */
  largeTransactionThreshold: number;
}

/** Default security settings */
export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  autoLockMinutes: 60,
  lastActivityAt: Date.now(),
  confirmLargeTransactions: true,
  largeTransactionThreshold: 100, // 100 NASUN
};

// ============================================
// Address Book Types
// ============================================

/** Address book entry with optional label and metadata */
export interface AddressBookEntry {
  /** Wallet address (0x...) */
  address: string;
  /** User-defined label/name */
  label?: string;
  /** Timestamp when label was last changed (for sync merge) */
  labelUpdatedAt: number;
  /** First transaction timestamp */
  firstTransactionAt: number;
  /** Last transaction timestamp */
  lastTransactionAt: number;
  /** Total number of transactions to this address */
  transactionCount: number;
  /** Is this address trusted/verified by user */
  isTrusted: boolean;
  /** Timestamp when isTrusted was last changed (for sync merge) */
  trustedUpdatedAt: number;
  /** Soft-delete timestamp. If set, entry is considered deleted. */
  deletedAt?: number;
}

/** Address book storage */
export interface AddressBook {
  /** Map of address -> entry */
  entries: Record<string, AddressBookEntry>;
  /** Last updated timestamp */
  updatedAt: number;
}

// ============================================
// Rate Limiting Types
// ============================================

/** Unlock attempt tracking for rate limiting */
export interface UnlockAttemptState {
  /** Number of consecutive failed attempts */
  failedAttempts: number;
  /** Lockout end timestamp (Date.now()), null if not locked */
  lockoutEndTime: number | null;
  /** Last attempt timestamp */
  lastAttemptTime: number;
}

/** Lockout tier configuration */
export interface LockoutTier {
  /** Minimum failed attempts to trigger this tier */
  attempts: number;
  /** Lockout duration in milliseconds */
  durationMs: number;
}

/** Rate limiting configuration - progressive lockout tiers */
export const LOCKOUT_TIERS: LockoutTier[] = [
  { attempts: 8, durationMs: 30 * 1000 },       // 30 seconds
  { attempts: 12, durationMs: 5 * 60 * 1000 },  // 5 minutes
  { attempts: 16, durationMs: 30 * 60 * 1000 }, // 30 minutes
];

/** Default unlock attempt state */
export const DEFAULT_UNLOCK_ATTEMPT_STATE: UnlockAttemptState = {
  failedAttempts: 0,
  lockoutEndTime: null,
  lastAttemptTime: 0,
};

// ============================================
// Transaction Simulation Types
// ============================================

/** Balance change from transaction simulation */
export interface BalanceChange {
  /** Owner address */
  owner: string;
  /** Coin type */
  coinType: string;
  /** Amount change (negative for outgoing) */
  amount: string;
  /** Token symbol (if known) */
  symbol?: string;
}

/** Transaction simulation result */
export interface TransactionSimulation {
  /** Whether the transaction would succeed */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Estimated gas cost in minimum units */
  gasEstimate: string;
  /** Balance changes that would occur */
  balanceChanges: BalanceChange[];
  /** Raw effects from simulation */
  effects?: unknown;
}

// ============================================
// zkLogin Types
// ============================================

export type {
  ZkLoginProvider,
  OAuthConfig,
  ZkLoginSession,
  ZkLoginProof,
  ZkLoginState,
  SaltResponse,
  ProverRequest,
  ProverResponse,
  ZkLoginConfig,
  ZkLoginErrorType,
} from './zklogin';

export { ZkLoginError } from './zklogin';

// ============================================
// Passkey Types
// ============================================

export type {
  PasskeyCredential,
  PasskeyRegistrationOptions,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationResult,
  PasskeyAuthenticationResult,
  PasskeyWalletState,
  PasskeyErrorType,
} from './passkey';

export {
  PasskeyError,
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
} from './passkey';

// ============================================
// Transaction History Types
// ============================================

/** Direction of a transaction relative to the wallet */
export type TransactionDirection = 'in' | 'out';

/** Individual token transfer within a transaction */
export interface TokenTransfer {
  /** Token type (coin type) */
  tokenType: string;
  /** Token symbol if known (NASUN, NBTC, NUSDC) */
  symbol?: string;
  /** Amount in display units */
  amount: string;
  /** Raw amount in minimum units */
  rawAmount: string;
  /** Direction relative to wallet owner */
  direction: TransactionDirection;
}

/** Transaction history item */
export interface TransactionHistoryItem {
  /** Transaction digest */
  digest: string;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Transaction status */
  status: 'success' | 'failure';
  /** Primary direction (based on gas payer) */
  direction: TransactionDirection;
  /** Token transfers in this transaction */
  transfers: TokenTransfer[];
  /** Counterparty addresses (sender if in, recipients if out) */
  counterparties: string[];
  /** Gas used in minimum units */
  gasUsed?: string;
  /** Error message if failed */
  error?: string;
}

/** Transaction history query options */
export interface TransactionHistoryOptions {
  /** Maximum number of transactions to fetch */
  limit?: number;
  /** Cursor for pagination */
  cursor?: string;
  /** Filter by direction */
  direction?: TransactionDirection;
}

/** Transaction history query result */
export interface TransactionHistoryResult {
  /** List of transactions */
  data: TransactionHistoryItem[];
  /** Whether there are more results */
  hasNextPage: boolean;
  /** Cursor for next page */
  nextCursor?: string;
}

// ============================================
// Portfolio Types
// ============================================

export type {
  TokenPrice,
  PriceProvider,
  TokenAsset,
  ChainPortfolio,
  PortfolioSummary,
  ERC20TokenConfig,
  PortfolioConfig,
  UsePortfolioOptions,
  UsePortfolioResult,
} from './portfolio';
