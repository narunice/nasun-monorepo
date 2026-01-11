/**
 * ERC-4337 Account Abstraction Types
 *
 * Core type definitions for smart accounts, user operations,
 * and related infrastructure.
 */

import type { Address, Hex } from 'viem';

/** Smart account type */
export type SmartAccountType = 'simple' | 'safe' | 'kernel';

/** Smart account state */
export interface SmartAccountState {
  /** Smart account address (counterfactual or deployed) */
  address: Address;
  /** Whether account is deployed on-chain */
  isDeployed: boolean;
  /** Account type */
  type: SmartAccountType;
  /** Owner EOA address */
  owner: Address;
  /** Chain ID */
  chainId: number;
}

/** Paymaster mode */
export type PaymasterMode =
  | 'none' // User pays gas
  | 'verifying' // Signature-based sponsorship
  | 'erc20'; // Pay gas with ERC-20 tokens

/** Transaction request for smart account */
export interface SmartAccountTxRequest {
  /** Target address */
  to: Address;
  /** Value in wei */
  value?: bigint;
  /** Calldata */
  data?: Hex;
}

/** Batch transaction call */
export interface BatchCall {
  to: Address;
  value: bigint;
  data: Hex;
}

/** UserOperation receipt from bundler */
export interface UserOperationReceipt {
  /** UserOperation hash */
  userOpHash: Hex;
  /** Transaction hash */
  transactionHash: Hex;
  /** Block number */
  blockNumber: bigint;
  /** Whether the operation succeeded */
  success: boolean;
  /** Gas used */
  actualGasUsed: bigint;
  /** Gas cost in wei */
  actualGasCost: bigint;
}

/** Bundler configuration */
export interface BundlerConfig {
  /** Bundler RPC URL */
  url: string;
  /** EntryPoint address */
  entryPoint: Address;
}

/** Paymaster configuration */
export interface PaymasterConfig {
  /** Paymaster URL */
  url: string;
  /** Paymaster type */
  type: PaymasterMode;
  /** API key (if required) */
  apiKey?: string;
}

/** Smart account options */
export interface SmartAccountOptions {
  /** Account type to create */
  type?: SmartAccountType;
  /** Custom salt for address derivation */
  salt?: bigint;
  /** Paymaster API key for sponsored transactions */
  paymasterApiKey?: string;
}

/** Gas estimation for UserOperation */
export interface UserOperationGasEstimate {
  /** Gas limit for call execution */
  callGasLimit: bigint;
  /** Gas limit for verification */
  verificationGasLimit: bigint;
  /** Pre-verification gas */
  preVerificationGas: bigint;
  /** Total gas in native units */
  totalGas: bigint;
  /** Gas price in wei */
  maxFeePerGas: bigint;
  /** Priority fee in wei */
  maxPriorityFeePerGas: bigint;
}

/** Estimated cost in various denominations */
export interface GasCostEstimate {
  /** Total gas units */
  totalGas: bigint;
  /** Cost in wei */
  costInWei: bigint;
  /** Cost in ETH (formatted) */
  costInEth: string;
  /** Approximate USD cost (if available) */
  costInUsd?: number;
  /** Whether this will be sponsored */
  isSponsored: boolean;
}

/** Paymaster sponsorship strategy */
export type PaymasterStrategy =
  | 'always' // Always sponsor
  | 'never' // Never sponsor
  | 'conditional'; // Sponsor based on conditions

/** Sponsorship condition */
export interface SponsorshipCondition {
  /** Max value per transaction (in wei) */
  maxValue?: bigint;
  /** Allowed contract addresses */
  allowedContracts?: `0x${string}`[];
  /** Allowed function selectors */
  allowedSelectors?: `0x${string}`[];
  /** Time window for sponsorship (epoch seconds) */
  validUntil?: number;
  /** Max sponsored transactions per day */
  maxDailyTxs?: number;
}

/** Paymaster context for sponsored transactions */
export interface PaymasterContext {
  /** Whether transaction is sponsored */
  isSponsored: boolean;
  /** Paymaster address */
  paymasterAddress?: `0x${string}`;
  /** Sponsorship reason (for UI) */
  sponsorReason?: string;
  /** Fallback gas estimate if sponsorship fails */
  fallbackEstimate?: GasCostEstimate;
}

// ============================================
// Session Key Types (P2)
// ============================================

/** Permission for session key */
export interface SessionKeyPermission {
  /** Target contract address */
  target: `0x${string}`;
  /** Allowed function selectors (empty = all functions) */
  selectors?: `0x${string}`[];
  /** Max value per call (in wei) */
  maxValue?: bigint;
  /** Max calls to this target */
  maxCalls?: number;
}

/** Session key configuration */
export interface SessionKeyConfig {
  /** Permissions granted to session key */
  permissions: SessionKeyPermission[];
  /** Session validity period (seconds from now) */
  validityPeriod: number;
  /** Max total transactions */
  maxTransactions?: number;
  /** Human-readable session name */
  name?: string;
}

/** Session key state */
export interface SessionKeyState {
  /** Session key address */
  address: `0x${string}`;
  /** Session key private key (encrypted) */
  encryptedPrivateKey: string;
  /** Permissions */
  permissions: SessionKeyPermission[];
  /** Created timestamp (epoch seconds) */
  createdAt: number;
  /** Expires timestamp (epoch seconds) */
  expiresAt: number;
  /** Number of transactions executed */
  txCount: number;
  /** Max transactions allowed */
  maxTransactions?: number;
  /** Session name */
  name?: string;
  /** Smart account address this session is for */
  smartAccountAddress: `0x${string}`;
  /** Chain ID */
  chainId: number;
  /** Whether session is revoked */
  isRevoked: boolean;
}

/** Session key validation result */
export interface SessionKeyValidation {
  /** Whether the session key is valid */
  isValid: boolean;
  /** Reason if invalid */
  reason?: string;
  /** Remaining transactions */
  remainingTxs?: number;
  /** Time until expiration (seconds) */
  expiresIn?: number;
}
