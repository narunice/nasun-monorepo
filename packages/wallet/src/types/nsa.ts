/**
 * Nasun Smart Account (NSA) Shared Types
 *
 * Type definitions for the SmartAccount system that separates
 * account identity from signing keys, enabling key rotation
 * and multi-path recovery without asset migration.
 */

/** Signer type enum matching Move contract constants */
export type NsaSignerType = 'zklogin' | 'passkey' | 'local' | 'hardware';

/** Numeric signer type matching Move contract u8 values */
export const NSA_SIGNER_TYPE_MAP: Record<NsaSignerType, number> = {
  zklogin: 0,
  passkey: 1,
  local: 2,
  hardware: 3,
};

/** On-chain signer info (matches Move SignerInfo struct) */
export interface NsaSignerInfo {
  address: string;
  signerType: NsaSignerType;
  weight: number;
  addedAt: number;
  label: string;
}

/** On-chain SmartAccount state */
export interface NsaAccountState {
  objectId: string;
  signers: NsaSignerInfo[];
  threshold: number;
  guardians: string[];
  guardianThreshold: number;
  recoveryOwner: string;
  nonce: number;
  createdAt: number;
}

/** Recovery request state (matches Move RecoveryRequest struct) */
export interface NsaRecoveryRequestState {
  objectId: string;
  accountId: string;
  requester: string;
  newOwner: string;
  approvals: string[];
  requiredApprovals: number;
  timelockEnd: number;
  isExecuted: boolean;
  isCancelled: boolean;
  createdAt: number;
}

/** Recovery tier levels */
export type RecoveryTier = 'multipath' | 'backup' | 'guardian';

/** Backup package for Tier 2 recovery */
export interface NsaBackupPackage {
  type?: 'nsa';
  version: 1 | 2;
  accountObjectId: string;
  encryptedPayload: string;
  salt: string;
  iv: string;
  createdAt: number;
}

/** Recovery status for UI display */
export type NsaRecoveryStatus =
  | 'idle'
  | 'pending_approvals'
  | 'timelock_active'
  | 'ready_to_execute'
  | 'executed'
  | 'cancelled';

/** NSA-specific error types */
export type NsaErrorType =
  | 'ACCOUNT_NOT_FOUND'
  | 'NOT_SIGNER'
  | 'NOT_GUARDIAN'
  | 'INSUFFICIENT_BALANCE'
  | 'RECOVERY_ALREADY_ACTIVE'
  | 'TIMELOCK_NOT_EXPIRED'
  | 'INSUFFICIENT_APPROVALS'
  | 'BACKUP_DECRYPT_FAILED'
  | 'BACKUP_INVALID_FORMAT'
  | 'TX_BUILD_FAILED'
  | 'TX_EXECUTE_FAILED';

/** NSA-specific error */
export class NsaError extends Error {
  type: NsaErrorType;

  constructor(type: NsaErrorType, message: string) {
    super(message);
    this.type = type;
    this.name = 'NsaError';
  }
}

/** Balance entry for a specific coin type */
export interface NsaBalanceEntry {
  coinType: string;
  balance: bigint;
  symbol?: string;
  decimals?: number;
}

export { NSA_PACKAGE_ID, NSA_REGISTRY_ID } from '@nasun/devnet-config';

/** On-chain SignerProposal state (2-phase signer addition) */
export interface NsaSignerProposal {
  objectId: string;
  accountId: string;
  proposer: string;
  pendingSigner: string;
  signerType: NsaSignerType;
  weight: number;
  label: string;
  createdAt: number;
  expiresAt: number;
  isExecuted: boolean;
  isCancelled: boolean;
}

/** Timelock duration in milliseconds (48 hours) */
export const NSA_TIMELOCK_MS = 172_800_000;
