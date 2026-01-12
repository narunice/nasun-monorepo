/**
 * Clear Signing Module
 *
 * Human-readable transaction display for secure signing.
 *
 * Features:
 * - Transaction decoding (Move & EVM)
 * - Human-readable summaries
 * - Risk assessment
 * - Simulation result display
 *
 * Usage:
 * ```typescript
 * import { decodeTx, formatTransaction, assessRisk } from '@nasun/wallet';
 *
 * // Decode transaction
 * const decoded = await decodeTx(txBytes, 'move', '6681cdfd', sender);
 *
 * // Format for display
 * const summary = formatTransaction(decoded, simulation);
 *
 * // Assess risk
 * const risk = assessRisk(decoded, simulation);
 *
 * // Check if ready to sign
 * if (risk.overallRisk !== 'critical') {
 *   // Show signing UI
 * }
 * ```
 */

// ============================================
// Types
// ============================================

export type {
  // Transaction types
  TxChainType,
  TxCategory,
  TxRiskLevel,
  // Decoded transactions
  DecodedTx,
  MoveDecodedTx,
  EVMDecodedTx,
  // Move types
  MoveCall,
  MoveArg,
  MoveArgType,
  // EVM types
  EVMCall,
  EVMParam,
  // Simulation types
  TokenBalanceChange,
  NFTChange,
  ApprovalChange,
  SimulationResult,
  // Risk types
  RiskFactor,
  RiskCategory,
  RiskAssessment,
  // Display types
  TxSummary,
  TxAction,
  TxActionType,
  TxActionIcon,
  // Request/Response
  ClearSigningRequest,
  ClearSigningResponse,
  // Contract registry
  KnownContract,
  ContractType,
  ContractRegistry,
  // Configuration
  ClearSigningConfig,
  ClearSigningErrorCode,
} from './types';

export {
  ClearSigningError,
  DEFAULT_CLEAR_SIGNING_CONFIG,
} from './types';

// ============================================
// Decoder
// ============================================

export {
  // Main decoder
  decodeTx,
  // Configuration
  configureClearSigning,
  getClearSigningConfig,
  // Utilities
  bytesToHex,
  hexToBytes,
  bytesToBigInt,
  decodeMoveArg,
  decodeAddress,
  isValidAddress,
  shortenAddress,
} from './decoder';

// ============================================
// Formatter
// ============================================

export {
  // Main formatter
  formatTransaction,
  // Risk assessment
  assessRisk,
  // Configuration
  setFormatterConfig,
  // Utilities
  formatAmount,
  formatGasCost,
  formatUSD,
  formatBalanceChange,
  // UI helpers
  getActionIconClass,
  getRiskLevelClass,
  getCategoryIconClass,
} from './formatter';
