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

/** Parameters for adding a signer */
export interface AddSignerParams {
  accountObjectId: string;
  newSigner: string;
  signerType: NsaSignerType;
  weight: number;
  label: string;
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
