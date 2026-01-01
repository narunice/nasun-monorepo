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

// ============================================
// Security Settings Types
// ============================================

/** Security configuration for wallet auto-lock and protection */
export interface SecuritySettings {
  /** Auto-lock timeout in minutes (0 = disabled, default: 15) */
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
  autoLockMinutes: 15,
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
  /** First transaction timestamp */
  firstTransactionAt: number;
  /** Last transaction timestamp */
  lastTransactionAt: number;
  /** Total number of transactions to this address */
  transactionCount: number;
  /** Is this address trusted/verified by user */
  isTrusted: boolean;
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
