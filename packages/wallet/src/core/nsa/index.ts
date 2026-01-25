/**
 * NSA (Nasun Smart Account) Core Module
 *
 * Provides on-chain client, backup utilities, and recovery helpers
 * for the SmartAccount system.
 */

// Client - On-chain query and transaction builders
export {
  fetchAccountState,
  fetchRecoveryRequest,
  findAccountsForAddress,
  fetchSignerProposal,
  findActiveProposalsForAccount,
  findProposalsForPendingSigner,
  buildCreateAccount,
  buildDeposit,
  buildWithdraw,
  buildProposeAddSigner,
  buildAcceptSignerProposal,
  buildCancelSignerProposal,
  buildDeclineSignerProposal,
  buildRemoveSigner,
  buildSetGuardians,
  buildUpdateThreshold,
  buildInitiateRecovery,
  buildApproveRecovery,
  buildExecuteRecovery,
  buildCancelRecovery,
} from './client';

// Backup - Tier 2 encrypted backup
export {
  createBackup,
  restoreFromBackup,
  validateBackupFormat,
} from './backup';

// Recovery - Tier 3 guardian recovery helpers
export {
  computeRecoveryStatus,
  getTimelockRemainingMs,
  formatTimelockRemaining,
  hasApproved,
  getRemainingApprovalsNeeded,
  canExecuteRecovery,
  canCancelRecovery,
  computeTimelockEnd,
  validateGuardianConfig,
} from './recovery';

// Types
export type {
  CreateAccountParams,
  DepositParams,
  WithdrawParams,
  ProposeAddSignerParams,
  AcceptSignerProposalParams,
  CancelSignerProposalParams,
  DeclineSignerProposalParams,
  RemoveSignerParams,
  SetGuardiansParams,
  UpdateThresholdParams,
  InitiateRecoveryParams,
  ApproveRecoveryParams,
  ExecuteRecoveryParams,
  CancelRecoveryParams,
  NsaTransactionBytes,
} from './types';
