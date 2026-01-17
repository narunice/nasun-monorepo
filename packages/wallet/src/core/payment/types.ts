/**
 * Payment UX Types
 *
 * Type definitions for intent-based payments and payment links.
 * Designed for WalletConnect Pay compatibility and Pado synergy.
 */

// ============================================
// Payment Chain & Status Types
// ============================================

/** Chain type for payment routing */
export type PaymentChainType = 'move' | 'evm';

/** Payment intent status */
export type PaymentIntentStatus =
  | 'pending' // Created, waiting for execution
  | 'processing' // TX submitted, awaiting confirmation
  | 'completed' // Successfully executed
  | 'failed' // Execution failed
  | 'expired' // TTL exceeded
  | 'cancelled'; // User cancelled

/** Payment execution status for hooks */
export type PaymentStatus =
  | 'idle'
  | 'validating'
  | 'confirming' // User confirmation step (optional)
  | 'executing'
  | 'success'
  | 'error';

// ============================================
// Payment Intent (Abstract Request)
// ============================================

/** Payment metadata for dApp/merchant context */
export interface PaymentMetadata {
  /** dApp/merchant name */
  appName?: string;
  /** dApp/merchant icon URL */
  appIcon?: string;
  /** Callback URL for payment completion */
  callbackUrl?: string;
  /** Custom data (JSON-serializable) */
  custom?: Record<string, unknown>;
}

/** Abstract payment request (chain-agnostic) */
export interface PaymentIntent {
  /** Unique intent ID (UUID v4) */
  id: string;
  /** Intent version for protocol upgrades */
  version: 1;
  /** Target chain type */
  chainType: PaymentChainType;
  /** Target chain ID (eip155 for EVM, network name for Move) */
  chainId: string;
  /** Recipient address */
  recipient: string;
  /** Amount in display units (e.g., "1.5") */
  amount: string;
  /** Token symbol (e.g., "NSN", "NBTC", "ETH") */
  token: string;
  /** Token type/address (full coin type for Move, contract address for EVM) */
  tokenType?: string;
  /** Optional message for recipient */
  message?: string;
  /** Optional reference ID for merchant integration */
  referenceId?: string;
  /** Creation timestamp (ms) */
  createdAt: number;
  /** Expiration timestamp (ms, optional) */
  expiresAt?: number;
  /** Current status */
  status: PaymentIntentStatus;
  /** Metadata for WalletConnect Pay / dApp integration */
  metadata?: PaymentMetadata;
}

// ============================================
// Payment Request (Execution Parameters)
// ============================================

/** Base payment request fields */
interface BasePaymentRequest {
  /** Recipient address */
  recipient: string;
  /** Amount in display units */
  amount: string;
  /** Optional message */
  message?: string;
}

/** Move chain payment request */
export interface MovePaymentRequest extends BasePaymentRequest {
  chainType: 'move';
  /** Full coin type (e.g., '0x2::sui::SUI') */
  tokenType: string;
}

/** EVM chain payment request */
export interface EVMPaymentRequest extends BasePaymentRequest {
  chainType: 'evm';
  /** EVM chain ID */
  chainId: number;
  /** Token contract address (undefined = native token) */
  tokenAddress?: string;
  /** Gas settings for EVM */
  gasSettings?: {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    gasLimit?: bigint;
  };
  /** Use smart account for gasless TX */
  useSmartAccount?: boolean;
}

/** Union type for all payment requests */
export type PaymentRequest = MovePaymentRequest | EVMPaymentRequest;

// ============================================
// Payment Result
// ============================================

/** Payment execution result */
export interface PaymentResult {
  /** Whether payment succeeded */
  success: boolean;
  /** Transaction digest/hash */
  txHash?: string;
  /** Error message if failed */
  error?: string;
  /** Gas cost (in native token, formatted) */
  gasCost?: string;
  /** Whether gas was sponsored (EVM AA) */
  sponsored?: boolean;
  /** Explorer URL for transaction */
  explorerUrl?: string;
  /** Completion timestamp */
  completedAt?: number;
}

// ============================================
// Payment Link (URL-based)
// ============================================

/** Payment link format */
export interface PaymentLink {
  /** Full URL for sharing */
  url: string;
  /** Base URL (e.g., 'https://pado.nasun.io/pay') */
  baseUrl: string;
  /** Recipient address */
  recipient: string;
  /** Pre-filled amount (optional) */
  amount?: string;
  /** Token symbol */
  token: string;
  /** Optional message */
  message?: string;
  /** QR code data URL (base64 PNG) */
  qrCodeDataUrl?: string;
}

/** Payment link parse result */
export interface ParsedPaymentLink {
  /** Recipient address */
  recipient: string;
  /** Amount (display units) */
  amount?: string;
  /** Token symbol */
  token: string;
  /** Chain ID (from URL or detected) */
  chainId?: string;
  /** Message */
  message?: string;
  /** Whether parse was successful */
  valid: boolean;
  /** Error reason if invalid */
  error?: string;
}

// ============================================
// Payment Validation
// ============================================

/** Validation error types */
export type PaymentValidationError =
  | { type: 'INSUFFICIENT_BALANCE'; required: string; available: string }
  | { type: 'INVALID_ADDRESS'; address: string }
  | { type: 'INVALID_AMOUNT'; reason: string }
  | { type: 'UNSUPPORTED_TOKEN'; token: string }
  | { type: 'CHAIN_MISMATCH'; expected: string; current: string }
  | { type: 'WALLET_NOT_CONNECTED' }
  | { type: 'SIGNER_NOT_AVAILABLE' };

/** Validation warning types */
export type PaymentValidationWarning =
  | { type: 'NEW_RECIPIENT'; address: string }
  | { type: 'LARGE_AMOUNT'; amount: string; threshold: string }
  | { type: 'LOW_GAS_BALANCE'; gasBalance: string; estimated: string }
  | { type: 'CONTRACT_RECIPIENT'; address: string };

/** Recipient status from address book */
export interface RecipientStatus {
  /** Whether recipient is in address book */
  isKnown: boolean;
  /** Whether recipient is marked as trusted */
  isTrusted: boolean;
  /** Recipient label from address book */
  label?: string;
  /** Number of previous transactions with recipient */
  txCount?: number;
}

/** Payment validation result */
export interface PaymentValidation {
  /** Whether payment can proceed */
  valid: boolean;
  /** Validation errors */
  errors: PaymentValidationError[];
  /** Warnings (non-blocking) */
  warnings: PaymentValidationWarning[];
  /** Estimated gas cost (if calculable) */
  estimatedGas?: string;
  /** Recipient address status */
  recipientStatus?: RecipientStatus;
}

// ============================================
// Constants
// ============================================

/** Default payment intent TTL (15 minutes) */
export const DEFAULT_INTENT_TTL_MS = 15 * 60 * 1000;

/** Nasun native coin type */
export const NASUN_COIN_TYPE = '0x2::sui::SUI';

/** Default token symbol */
export const DEFAULT_TOKEN_SYMBOL = 'NSN';

/** URL parameter keys (Pado compatible) */
export const URL_PARAMS = {
  TO: 'to',
  AMOUNT: 'amount',
  TOKEN: 'token',
  MESSAGE: 'msg',
  CHAIN: 'chain',
  REF: 'ref',
} as const;
