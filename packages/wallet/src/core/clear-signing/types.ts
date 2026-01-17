/**
 * Clear Signing Types
 *
 * Type definitions for human-readable transaction display.
 * Ensures users understand what they're signing before approval.
 *
 * Design Principles:
 * 1. Clarity over cleverness - always show full context
 * 2. Risk visibility - highlight dangerous operations
 * 3. Chain-agnostic - support Move and EVM transactions
 * 4. Simulation-first - show expected state changes
 */

// ============================================
// Transaction Types
// ============================================

/** Supported transaction chain types */
export type TxChainType = 'move' | 'evm';

/** Transaction category for UX grouping */
export type TxCategory =
  | 'transfer' // Token/NFT transfer
  | 'swap' // DEX swap
  | 'stake' // Staking operations
  | 'governance' // Voting, delegation
  | 'nft' // NFT mint, transfer
  | 'defi' // Lending, borrowing, LP
  | 'contract' // Generic contract interaction
  | 'system' // Upgrade, configuration
  | 'unknown'; // Unrecognized

/** Risk level for transaction */
export type TxRiskLevel =
  | 'low' // Standard operations
  | 'medium' // Large amounts, new recipients
  | 'high' // Approvals, upgrades, unknown contracts
  | 'critical'; // Unlimited approvals, dangerous patterns

// ============================================
// Decoded Transaction
// ============================================

/** Base decoded transaction fields */
export interface DecodedTxBase {
  /** Transaction chain type */
  chainType: TxChainType;
  /** Chain ID */
  chainId: string;
  /** Transaction category */
  category: TxCategory;
  /** Sender address */
  sender: string;
  /** Raw transaction bytes (hex) */
  rawBytes: string;
  /** Decoded timestamp */
  decodedAt: number;
}

/** Move transaction decoded */
export interface MoveDecodedTx extends DecodedTxBase {
  chainType: 'move';
  /** Move calls (one or more) */
  calls: MoveCall[];
  /** Gas budget */
  gasBudget: bigint;
  /** Sponsor address if sponsored */
  sponsor?: string;
}

/** EVM transaction decoded */
export interface EVMDecodedTx extends DecodedTxBase {
  chainType: 'evm';
  /** Target contract address */
  to: string;
  /** Value in wei */
  value: bigint;
  /** Decoded function call */
  call?: EVMCall;
  /** Gas limit */
  gasLimit: bigint;
  /** Max fee per gas */
  maxFeePerGas?: bigint;
  /** Max priority fee */
  maxPriorityFeePerGas?: bigint;
  /** Nonce */
  nonce?: number;
}

/** Union type for decoded transactions */
export type DecodedTx = MoveDecodedTx | EVMDecodedTx;

// ============================================
// Move Transaction Calls
// ============================================

/** Move function call */
export interface MoveCall {
  /** Package address */
  package: string;
  /** Module name */
  module: string;
  /** Function name */
  function: string;
  /** Type arguments (generics) */
  typeArgs: string[];
  /** Decoded arguments */
  args: MoveArg[];
}

/** Move argument */
export interface MoveArg {
  /** Argument type */
  type: MoveArgType;
  /** Raw value (bytes or string) */
  raw: string;
  /** Decoded value for display */
  decoded: string | number | bigint | boolean | MoveArg[];
  /** Display-friendly label */
  label?: string;
}

/** Move argument types */
export type MoveArgType =
  | 'address'
  | 'u8'
  | 'u16'
  | 'u32'
  | 'u64'
  | 'u128'
  | 'u256'
  | 'bool'
  | 'string'
  | 'vector'
  | 'object'
  | 'coin'
  | 'unknown';

// ============================================
// EVM Transaction Calls
// ============================================

/** EVM function call */
export interface EVMCall {
  /** Function selector (4 bytes hex) */
  selector: string;
  /** Function signature if decoded */
  signature?: string;
  /** Function name if decoded */
  name?: string;
  /** Decoded parameters */
  params: EVMParam[];
  /** Contract address */
  contract: string;
  /** Contract name if known */
  contractName?: string;
}

/** EVM parameter */
export interface EVMParam {
  /** Parameter name */
  name: string;
  /** Solidity type */
  type: string;
  /** Raw value (hex) */
  raw: string;
  /** Decoded value */
  decoded: string | bigint | boolean | string[] | EVMParam[];
  /** Display-friendly label */
  label?: string;
}

// ============================================
// State Changes (Simulation)
// ============================================

/** Token balance change */
export interface TokenBalanceChange {
  /** Token type/address */
  token: string;
  /** Token symbol */
  symbol: string;
  /** Token decimals */
  decimals: number;
  /** Change amount (negative for outgoing) */
  amount: bigint;
  /** Display amount (formatted) */
  displayAmount: string;
  /** USD value if available */
  usdValue?: number;
}

/** NFT ownership change */
export interface NFTChange {
  /** NFT collection address */
  collection: string;
  /** NFT ID */
  tokenId: string;
  /** NFT name if available */
  name?: string;
  /** NFT image URL if available */
  imageUrl?: string;
  /** Whether NFT is incoming (true) or outgoing (false) */
  isIncoming: boolean;
}

/** Approval/allowance change */
export interface ApprovalChange {
  /** Token/collection address */
  token: string;
  /** Token symbol */
  symbol: string;
  /** Spender address */
  spender: string;
  /** Spender name if known */
  spenderName?: string;
  /** Allowance amount (bigint max = unlimited) */
  amount: bigint;
  /** Whether this is unlimited approval */
  isUnlimited: boolean;
  /** Previous allowance if known */
  previousAmount?: bigint;
}

/** Expected state changes from simulation */
export interface SimulationResult {
  /** Whether simulation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Token balance changes */
  balanceChanges: TokenBalanceChange[];
  /** NFT changes */
  nftChanges: NFTChange[];
  /** Approval changes */
  approvalChanges: ApprovalChange[];
  /** Gas estimate */
  estimatedGas?: bigint;
  /** Whether transaction will revert */
  willRevert?: boolean;
  /** Revert reason if available */
  revertReason?: string;
}

// ============================================
// Risk Analysis
// ============================================

/** Risk factor for transaction */
export interface RiskFactor {
  /** Risk level */
  level: TxRiskLevel;
  /** Risk category */
  category: RiskCategory;
  /** Short description */
  title: string;
  /** Detailed description */
  description: string;
  /** Mitigation suggestion */
  mitigation?: string;
}

/** Risk categories */
export type RiskCategory =
  | 'value' // Large value transfer
  | 'approval' // Token approval
  | 'recipient' // Unknown/suspicious recipient
  | 'contract' // Unknown/unverified contract
  | 'function' // Dangerous function call
  | 'pattern' // Known scam pattern
  | 'simulation' // Simulation warning
  | 'upgrade'; // Contract/account upgrade

/** Complete risk assessment */
export interface RiskAssessment {
  /** Overall risk level */
  overallRisk: TxRiskLevel;
  /** Individual risk factors */
  factors: RiskFactor[];
  /** Risk score (0-100) */
  score: number;
  /** Whether to require additional confirmation */
  requiresExtraConfirmation: boolean;
}

// ============================================
// Display Format
// ============================================

/** Human-readable transaction summary */
export interface TxSummary {
  /** Transaction title */
  title: string;
  /** Transaction description */
  description: string;
  /** Transaction category */
  category: TxCategory;
  /** Risk level */
  riskLevel: TxRiskLevel;
  /** Primary action items */
  actions: TxAction[];
  /** Formatted gas cost */
  gasCost?: string;
  /** Whether gas is sponsored */
  isSponsored?: boolean;
}

/** Transaction action item */
export interface TxAction {
  /** Action type */
  type: TxActionType;
  /** Action label */
  label: string;
  /** Primary value (amount, address, etc) */
  value: string;
  /** Secondary label */
  sublabel?: string;
  /** Icon hint */
  icon?: TxActionIcon;
}

/** Action types */
export type TxActionType =
  | 'send' // Sending tokens/NFTs
  | 'receive' // Receiving tokens/NFTs
  | 'swap' // Swapping tokens
  | 'approve' // Approving allowance
  | 'revoke' // Revoking allowance
  | 'stake' // Staking
  | 'unstake' // Unstaking
  | 'vote' // Voting
  | 'mint' // Minting
  | 'burn' // Burning
  | 'call'; // Generic contract call

/** Action icons */
export type TxActionIcon =
  | 'arrow-up' // Outgoing
  | 'arrow-down' // Incoming
  | 'swap' // Exchange
  | 'shield' // Approval
  | 'shield-off' // Revoke
  | 'lock' // Stake
  | 'unlock' // Unstake
  | 'check' // Vote
  | 'plus' // Mint
  | 'minus' // Burn
  | 'terminal'; // Contract

// ============================================
// Clear Signing Request/Response
// ============================================

/** Request to decode and display transaction */
export interface ClearSigningRequest {
  /** Raw transaction bytes */
  txBytes: Uint8Array;
  /** Chain type */
  chainType: TxChainType;
  /** Chain ID */
  chainId: string;
  /** Sender address */
  sender: string;
  /** Optional: skip simulation */
  skipSimulation?: boolean;
  /** Optional: timeout for simulation (ms) */
  simulationTimeout?: number;
}

/** Complete clear signing response */
export interface ClearSigningResponse {
  /** Decoded transaction */
  decoded: DecodedTx;
  /** Human-readable summary */
  summary: TxSummary;
  /** Simulation result */
  simulation?: SimulationResult;
  /** Risk assessment */
  risk: RiskAssessment;
  /** Whether transaction is ready for signing */
  readyToSign: boolean;
  /** Blocking reasons if not ready */
  blockingReasons?: string[];
}

// ============================================
// Known Contracts Registry
// ============================================

/** Known contract info */
export interface KnownContract {
  /** Contract address */
  address: string;
  /** Contract name */
  name: string;
  /** Contract type */
  type: ContractType;
  /** Whether verified */
  verified: boolean;
  /** Chain ID */
  chainId: string;
  /** Logo URL */
  logoUrl?: string;
  /** Website URL */
  websiteUrl?: string;
}

/** Contract types */
export type ContractType =
  | 'token' // ERC20 / Coin
  | 'nft' // ERC721 / NFT
  | 'dex' // DEX router
  | 'lending' // Lending protocol
  | 'bridge' // Cross-chain bridge
  | 'governance' // DAO / Voting
  | 'oracle' // Price oracle
  | 'system' // System contract
  | 'unknown';

/** Contract registry interface */
export interface ContractRegistry {
  /** Get known contract by address */
  get(chainId: string, address: string): KnownContract | null;
  /** Check if contract is verified */
  isVerified(chainId: string, address: string): boolean;
  /** Check if contract is flagged as risky */
  isFlagged(chainId: string, address: string): boolean;
}

// ============================================
// Error Types
// ============================================

/** Clear signing error codes */
export type ClearSigningErrorCode =
  | 'DECODE_FAILED' // Failed to decode transaction
  | 'UNSUPPORTED_CHAIN' // Chain not supported
  | 'SIMULATION_FAILED' // Simulation failed
  | 'SIMULATION_TIMEOUT' // Simulation timed out
  | 'INVALID_TX_FORMAT' // Invalid transaction format
  | 'UNKNOWN_CONTRACT'; // Unknown contract interaction

/** Clear signing error */
export class ClearSigningError extends Error {
  readonly code: ClearSigningErrorCode;
  readonly cause?: unknown;

  constructor(
    code: ClearSigningErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = 'ClearSigningError';
    this.code = code;
    this.cause = cause;
  }
}

// ============================================
// Configuration
// ============================================

/** Clear signing configuration */
export interface ClearSigningConfig {
  /** Whether to enable simulation */
  enableSimulation: boolean;
  /** Simulation timeout (ms) */
  simulationTimeout: number;
  /** RPC URL for simulation */
  simulationRpcUrl?: string;
  /** Contract registry */
  contractRegistry?: ContractRegistry;
  /** Large amount threshold (USD) */
  largeAmountThreshold: number;
  /** Unlimited approval warning */
  warnUnlimitedApproval: boolean;
}

/** Default configuration */
export const DEFAULT_CLEAR_SIGNING_CONFIG: ClearSigningConfig = {
  enableSimulation: true,
  simulationTimeout: 10_000,
  largeAmountThreshold: 1000, // $1000 USD
  warnUnlimitedApproval: true,
};
