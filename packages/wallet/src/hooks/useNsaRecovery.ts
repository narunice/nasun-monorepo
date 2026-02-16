/**
 * useNsaRecovery Hook
 *
 * Manages Tier 3 Guardian Social Recovery flow.
 * Provides state tracking and transaction execution for
 * initiating, approving, executing, and cancelling recovery.
 *
 * Supports optional overrides for guardian mode, where a guardian
 * operates on another user's SmartAccount without modifying local store.
 */

import { useCallback, useState, useEffect } from 'react';
import { useNsaStore } from '../stores/nsaStore';
import {
  fetchRecoveryRequest,
  buildInitiateRecovery,
  buildApproveRecovery,
  buildExecuteRecovery,
  buildCancelRecovery,
} from '../core/nsa/client';
import {
  computeRecoveryStatus,
  getTimelockRemainingMs,
  formatTimelockRemaining,
  getRemainingApprovalsNeeded,
  canExecuteRecovery,
  canCancelRecovery,
  hasApproved as checkHasApproved,
} from '../core/nsa/recovery';
import type { NsaRecoveryRequestState, NsaRecoveryStatus, NsaAccountState } from '../types/nsa';
import type { SignerAdapter } from '../core/signer/types';
import { getSuiClient } from '../sui/client';

/**
 * Optional overrides for guardian mode.
 * When provided, the hook operates on the target account
 * instead of the local store's account.
 */
export interface NsaRecoveryOverrides {
  accountObjectId: string;
  accountState: NsaAccountState;
  activeRecoveryId?: string | null;
}

export interface UseNsaRecoveryResult {
  /** Active recovery request state */
  recoveryRequest: NsaRecoveryRequestState | null;
  /** Current recovery status */
  status: NsaRecoveryStatus;
  /** Remaining timelock in ms */
  timelockRemainingMs: number;
  /** Human-readable timelock remaining */
  timelockDisplay: string;
  /** Number of approvals still needed */
  approvalsNeeded: number;
  /** Whether the recovery is loading */
  isLoading: boolean;
  /** Initiate a recovery request (guardian) */
  initiateRecovery: (newOwner: string, signer: SignerAdapter) => Promise<void>;
  /** Approve a recovery request (guardian) */
  approveRecovery: (signer: SignerAdapter) => Promise<void>;
  /** Execute recovery after timelock + threshold (anyone) */
  executeRecovery: (signer: SignerAdapter) => Promise<void>;
  /** Cancel recovery (account signer) */
  cancelRecovery: (signer: SignerAdapter) => Promise<void>;
  /** Refresh recovery request state */
  refreshRecovery: () => Promise<void>;
  /** Check if an address has already approved */
  hasApproved: (address: string) => boolean;
  /** Whether current conditions allow execution */
  canExecute: boolean;
  /** Whether current address can cancel */
  canCancel: (address: string) => boolean;
}

export function useNsaRecovery(overrides?: NsaRecoveryOverrides): UseNsaRecoveryResult {
  const storeActiveRecoveryId = useNsaStore((s) => s.activeRecoveryId);
  const storeAccountState = useNsaStore((s) => s.accountState);

  // Effective values: overrides take precedence over store
  const isGuardianMode = !!overrides;
  const effectiveAccountState = overrides?.accountState ?? storeAccountState;
  const effectiveRecoveryId = overrides?.activeRecoveryId !== undefined
    ? overrides.activeRecoveryId
    : storeActiveRecoveryId;

  const [recoveryRequest, setRecoveryRequest] = useState<NsaRecoveryRequestState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Update timestamp periodically for timelock display
  useEffect(() => {
    if (!recoveryRequest || recoveryRequest.isExecuted || recoveryRequest.isCancelled) return;

    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, [recoveryRequest]);

  const refreshRecovery = useCallback(async () => {
    // In guardian mode, use the overrides recovery ID
    // In normal mode, read from store (may have been updated)
    const requestId = isGuardianMode
      ? overrides?.activeRecoveryId
      : useNsaStore.getState().activeRecoveryId;
    if (!requestId) return;

    setIsLoading(true);
    try {
      const request = await fetchRecoveryRequest(requestId);
      setRecoveryRequest(request);
    } finally {
      setIsLoading(false);
    }
  }, [isGuardianMode, overrides?.activeRecoveryId]);

  // Fetch recovery request when ID is set
  useEffect(() => {
    if (effectiveRecoveryId) {
      refreshRecovery();
    } else {
      setRecoveryRequest(null);
    }
  }, [effectiveRecoveryId, refreshRecovery]);

  const initiateRecovery = useCallback(async (
    newOwner: string,
    signer: SignerAdapter,
  ): Promise<void> => {
    const objId = isGuardianMode
      ? overrides?.accountObjectId
      : useNsaStore.getState().accountObjectId;
    if (!objId) throw new Error('No SmartAccount configured');

    const tx = buildInitiateRecovery({ accountObjectId: objId, newOwner });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    const result = await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true, showObjectChanges: true },
    });

    // Find the created RecoveryRequest
    const created = result.objectChanges?.find(
      (change: { type: string; objectType?: string; objectId?: string }) =>
        change.type === 'created' && change.objectType?.includes('RecoveryRequest')
    );

    if (created && created.type === 'created' && created.objectId) {
      // Only persist to store in normal mode (not guardian mode)
      if (!isGuardianMode) {
        useNsaStore.getState().setActiveRecovery(created.objectId);
      }
      // Fetch the newly created request to update local state
      try {
        const request = await fetchRecoveryRequest(created.objectId);
        setRecoveryRequest(request);
      } catch {
        // Will be fetched on next refresh
      }
    }
  }, [isGuardianMode, overrides?.accountObjectId]);

  const approveRecovery = useCallback(async (signer: SignerAdapter): Promise<void> => {
    const accountId = isGuardianMode
      ? overrides?.accountObjectId
      : useNsaStore.getState().accountObjectId;
    const recoveryId = isGuardianMode
      ? (recoveryRequest?.objectId ?? overrides?.activeRecoveryId)
      : useNsaStore.getState().activeRecoveryId;

    if (!recoveryId || !accountId) {
      throw new Error('No active recovery request');
    }

    const tx = buildApproveRecovery({
      requestObjectId: recoveryId,
      accountObjectId: accountId,
    });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    // Re-fetch recovery state
    try {
      const request = await fetchRecoveryRequest(recoveryId);
      setRecoveryRequest(request);
    } catch {
      // Will be fetched on next refresh
    }
  }, [isGuardianMode, overrides?.accountObjectId, overrides?.activeRecoveryId, recoveryRequest?.objectId]);

  const executeRecovery = useCallback(async (signer: SignerAdapter): Promise<void> => {
    const accountId = isGuardianMode
      ? overrides?.accountObjectId
      : useNsaStore.getState().accountObjectId;
    const recoveryId = isGuardianMode
      ? (recoveryRequest?.objectId ?? overrides?.activeRecoveryId)
      : useNsaStore.getState().activeRecoveryId;

    if (!recoveryId || !accountId) {
      throw new Error('No active recovery request');
    }

    const tx = buildExecuteRecovery({
      requestObjectId: recoveryId,
      accountObjectId: accountId,
    });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    if (!isGuardianMode) {
      useNsaStore.getState().setActiveRecovery(null);
    }

    // Re-fetch to show executed state
    try {
      const request = await fetchRecoveryRequest(recoveryId);
      setRecoveryRequest(request);
    } catch {
      setRecoveryRequest(null);
    }
  }, [isGuardianMode, overrides?.accountObjectId, overrides?.activeRecoveryId, recoveryRequest?.objectId]);

  const cancelRecovery = useCallback(async (signer: SignerAdapter): Promise<void> => {
    const accountId = isGuardianMode
      ? overrides?.accountObjectId
      : useNsaStore.getState().accountObjectId;
    const recoveryId = isGuardianMode
      ? (recoveryRequest?.objectId ?? overrides?.activeRecoveryId)
      : useNsaStore.getState().activeRecoveryId;

    if (!recoveryId || !accountId) {
      throw new Error('No active recovery request');
    }

    const tx = buildCancelRecovery({
      requestObjectId: recoveryId,
      accountObjectId: accountId,
    });
    const client = getSuiClient();

    tx.setSender(signer.address);
    const txBytes = await tx.build({ client });
    const { signature } = await signer.sign(txBytes);

    await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    if (!isGuardianMode) {
      useNsaStore.getState().setActiveRecovery(null);
    }
    setRecoveryRequest(null);
  }, [isGuardianMode, overrides?.accountObjectId, overrides?.activeRecoveryId, recoveryRequest?.objectId]);

  const status = recoveryRequest
    ? computeRecoveryStatus(recoveryRequest, now)
    : 'idle' as NsaRecoveryStatus;

  const timelockRemainingMs = recoveryRequest
    ? getTimelockRemainingMs(recoveryRequest, now)
    : 0;

  const timelockDisplay = recoveryRequest
    ? formatTimelockRemaining(recoveryRequest, now)
    : '';

  const approvalsNeeded = recoveryRequest
    ? getRemainingApprovalsNeeded(recoveryRequest)
    : 0;

  const canExecute = recoveryRequest
    ? canExecuteRecovery(recoveryRequest, now)
    : false;

  return {
    recoveryRequest,
    status,
    timelockRemainingMs,
    timelockDisplay,
    approvalsNeeded,
    isLoading,
    initiateRecovery,
    approveRecovery,
    executeRecovery,
    cancelRecovery,
    refreshRecovery,
    hasApproved: (address: string) =>
      recoveryRequest ? checkHasApproved(recoveryRequest, address) : false,
    canExecute,
    canCancel: (address: string) =>
      recoveryRequest && effectiveAccountState
        ? canCancelRecovery(recoveryRequest, effectiveAccountState, address)
        : false,
  };
}
