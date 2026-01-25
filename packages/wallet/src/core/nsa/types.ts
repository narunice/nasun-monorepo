/**
 * NSA Core Module Types
 *
 * Internal types for the NSA client module operations.
 */

import type { NsaSignerType } from '../../types/nsa';

/** Parameters for creating a SmartAccount */
export interface CreateAccountParams {
  initialSignerType: NsaSignerType;
  label: string;
}

/** Parameters for depositing to SmartAccount */
export interface DepositParams {
  accountObjectId: string;
  coinType: string;
  coinObjectId: string;
}

/** Parameters for withdrawing from SmartAccount */
export interface WithdrawParams {
  accountObjectId: string;
  coinType: string;
  amount: bigint;
  recipient: string;
}

/** Parameters for proposing a new signer (Phase 1 of 2-phase commit) */
export interface ProposeAddSignerParams {
  accountObjectId: string;
  pendingSigner: string;
  signerType: NsaSignerType;
  weight: number;
  label: string;
}

/** Parameters for accepting a signer proposal (Phase 2 - proof of ownership) */
export interface AcceptSignerProposalParams {
  proposalObjectId: string;
  accountObjectId: string;
}

/** Parameters for cancelling a signer proposal */
export interface CancelSignerProposalParams {
  proposalObjectId: string;
  accountObjectId: string;
}

/** Parameters for declining a signer proposal (by pending signer) */
export interface DeclineSignerProposalParams {
  proposalObjectId: string;
}

/** Parameters for removing a signer */
export interface RemoveSignerParams {
  accountObjectId: string;
  signerToRemove: string;
}

/** Parameters for setting guardians */
export interface SetGuardiansParams {
  accountObjectId: string;
  guardians: string[];
  guardianThreshold: number;
  recoveryOwner: string;
}

/** Parameters for updating threshold */
export interface UpdateThresholdParams {
  accountObjectId: string;
  newThreshold: number;
}

/** Parameters for initiating recovery */
export interface InitiateRecoveryParams {
  accountObjectId: string;
  newOwner: string;
}

/** Parameters for approving recovery */
export interface ApproveRecoveryParams {
  requestObjectId: string;
  accountObjectId: string;
}

/** Parameters for executing recovery */
export interface ExecuteRecoveryParams {
  requestObjectId: string;
  accountObjectId: string;
}

/** Parameters for cancelling recovery */
export interface CancelRecoveryParams {
  requestObjectId: string;
  accountObjectId: string;
}

/** Transaction build result (unsigned) */
export interface NsaTransactionBytes {
  txBytes: Uint8Array;
  digest: string;
}
