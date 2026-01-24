/**
 * NSA Recovery - Tier 3 Guardian Social Recovery Utilities
 *
 * Helper functions for managing the guardian-based social recovery flow.
 * Provides status computation, timelock tracking, and approval state.
 */

import { NSA_TIMELOCK_MS } from '../../types/nsa';
import type {
  NsaRecoveryRequestState,
  NsaRecoveryStatus,
  NsaAccountState,
} from '../../types/nsa';

/**
 * Compute the current recovery status from request state
 */
export function computeRecoveryStatus(
  request: NsaRecoveryRequestState,
  nowMs: number = Date.now(),
): NsaRecoveryStatus {
  if (request.isExecuted) return 'executed';
  if (request.isCancelled) return 'cancelled';

  const hasEnoughApprovals = request.approvals.length >= request.requiredApprovals;
  const timelockExpired = nowMs >= request.timelockEnd;

  if (hasEnoughApprovals && timelockExpired) return 'ready_to_execute';
  if (nowMs < request.timelockEnd) return 'timelock_active';
  return 'pending_approvals';
}

/**
 * Get remaining timelock duration in milliseconds
 * Returns 0 if timelock has already expired
 */
export function getTimelockRemainingMs(
  request: NsaRecoveryRequestState,
  nowMs: number = Date.now(),
): number {
  if (nowMs >= request.timelockEnd) return 0;
  return request.timelockEnd - nowMs;
}

/**
 * Format remaining timelock as human-readable string
 */
export function formatTimelockRemaining(
  request: NsaRecoveryRequestState,
  nowMs: number = Date.now(),
): string {
  const remainingMs = getTimelockRemainingMs(request, nowMs);
  if (remainingMs === 0) return 'Expired';

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
}

/**
 * Check if a given address has already approved a recovery request
 */
export function hasApproved(request: NsaRecoveryRequestState, address: string): boolean {
  return request.approvals.includes(address);
}

/**
 * Get number of remaining approvals needed
 */
export function getRemainingApprovalsNeeded(request: NsaRecoveryRequestState): number {
  const needed = request.requiredApprovals - request.approvals.length;
  return Math.max(0, needed);
}

/**
 * Check if a recovery request can be executed
 */
export function canExecuteRecovery(
  request: NsaRecoveryRequestState,
  nowMs: number = Date.now(),
): boolean {
  if (request.isExecuted || request.isCancelled) return false;
  const hasEnoughApprovals = request.approvals.length >= request.requiredApprovals;
  const timelockExpired = nowMs >= request.timelockEnd;
  return hasEnoughApprovals && timelockExpired;
}

/**
 * Check if a recovery request can be cancelled by a given address
 * Only signers of the account can cancel
 */
export function canCancelRecovery(
  request: NsaRecoveryRequestState,
  account: NsaAccountState,
  callerAddress: string,
): boolean {
  if (request.isExecuted || request.isCancelled) return false;
  return account.signers.some((s) => s.address === callerAddress);
}

/**
 * Compute timelock end timestamp for a new recovery request
 */
export function computeTimelockEnd(startMs: number = Date.now()): number {
  return startMs + NSA_TIMELOCK_MS;
}

/**
 * Validate guardian configuration before setting
 */
export function validateGuardianConfig(
  guardians: string[],
  threshold: number,
  signerAddresses: string[],
): { valid: boolean; error?: string } {
  if (guardians.length === 0 && threshold === 0) {
    return { valid: true };
  }

  if (guardians.length === 0 && threshold > 0) {
    return { valid: false, error: 'Cannot set threshold with no guardians' };
  }

  if (threshold < 2) {
    return { valid: false, error: 'Guardian threshold must be at least 2' };
  }

  if (threshold > guardians.length) {
    return { valid: false, error: 'Threshold cannot exceed guardian count' };
  }

  if (guardians.length > 5) {
    return { valid: false, error: 'Maximum 5 guardians allowed' };
  }

  // Check overlap with signers
  for (const guardian of guardians) {
    if (signerAddresses.includes(guardian)) {
      return { valid: false, error: `Guardian ${guardian} is also a signer` };
    }
  }

  // Check duplicates
  const unique = new Set(guardians);
  if (unique.size !== guardians.length) {
    return { valid: false, error: 'Duplicate guardian addresses' };
  }

  return { valid: true };
}
