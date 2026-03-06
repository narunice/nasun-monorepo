/**
 * NsaRecoveryPanel Component
 * Guardian recovery flow: initiate, approve, execute, cancel
 *
 * Supports guardian mode via guardianContext prop, allowing a guardian
 * to operate on another user's SmartAccount without modifying local store.
 */

import { useState } from 'react';
import {
  useNsaRecovery,
  useNasunSmartAccount,
  useSigner,
} from '@nasun/wallet';
import type { GuardianContext } from './NsaGuardianConnect';

interface NsaRecoveryPanelProps {
  onClose: () => void;
  guardianContext?: GuardianContext;
}

type Role = 'owner' | 'guardian' | 'none';

export function NsaRecoveryPanel({ onClose, guardianContext }: NsaRecoveryPanelProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Use guardianContext overrides when in guardian mode
  const storeState = useNasunSmartAccount();
  const accountState = guardianContext?.accountState ?? storeState.accountState;

  const {
    status,
    timelockDisplay,
    approvalsNeeded,
    canExecute,
    initiateRecovery,
    approveRecovery,
    executeRecovery,
    cancelRecovery,
    hasApproved,
    isLoading,
  } = useNsaRecovery(
    guardianContext
      ? {
          accountObjectId: guardianContext.accountObjectId,
          accountState: guardianContext.accountState,
          activeRecoveryId: guardianContext.activeRecoveryId,
        }
      : undefined
  );

  const { signer, address } = useSigner();

  // Determine user role from the effective account state (case-insensitive)
  const normalizedAddress = address?.toLowerCase() || '';
  const isSigner = accountState?.signers?.some((s) => s.address.toLowerCase() === normalizedAddress);
  const isGuardian = normalizedAddress
    ? accountState?.guardians?.some((g) => g.toLowerCase() === normalizedAddress)
    : false;
  const role: Role = isSigner ? 'owner' : isGuardian ? 'guardian' : 'none';

  // Recovery owner is pre-configured on-chain (read-only)
  const recoveryOwner = accountState?.recoveryOwner || '';
  const alreadyApproved = address ? hasApproved(address) : false;

  const handleInitiate = async () => {
    if (!signer || !recoveryOwner) return;
    setActionInProgress('initiate');
    setError(null);
    try {
      await initiateRecovery(recoveryOwner, signer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate recovery');
    }
    setActionInProgress(null);
  };

  const handleApprove = async () => {
    if (!signer) return;
    setActionInProgress('approve');
    setError(null);
    try {
      await approveRecovery(signer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    }
    setActionInProgress(null);
  };

  const handleExecute = async () => {
    if (!signer) return;
    setActionInProgress('execute');
    setError(null);
    try {
      await executeRecovery(signer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute recovery');
    }
    setActionInProgress(null);
  };

  const handleCancel = async () => {
    if (!signer) return;
    setActionInProgress('cancel');
    setError(null);
    try {
      await cancelRecovery(signer);
      setShowCancelConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel recovery');
    }
    setActionInProgress(null);
  };

  return (
    <div className="p-4 w-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onClose}
          className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Account Recovery</h3>
      </div>

      {/* Guardian Mode Banner */}
      {guardianContext && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded mb-4">
          <p className="text-xs xl:text-sm text-blue-800 dark:text-blue-300 font-medium">
            Guardian Mode
          </p>
          <p className="text-xs xl:text-sm text-blue-700 dark:text-blue-400 font-mono mt-0.5">
            {guardianContext.accountObjectId.slice(0, 10)}...{guardianContext.accountObjectId.slice(-6)}
          </p>
        </div>
      )}

      {/* Status Display */}
      {status !== 'idle' && (
        <div className={`p-3 rounded mb-4 ${
          status === 'ready_to_execute'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
            : status === 'cancelled' || status === 'executed'
            ? 'bg-gray-50 dark:bg-zinc-700/50'
            : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
        }`}>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs xl:text-sm">
              <span className="text-gray-500 dark:text-zinc-400">Status</span>
              <span className="font-medium text-gray-900 dark:text-white capitalize">
                {status.replace(/_/g, ' ')}
              </span>
            </div>
            {(status === 'timelock_active' || status === 'pending_approvals') && (
              <>
                <div className="flex justify-between text-xs xl:text-sm">
                  <span className="text-gray-500 dark:text-zinc-400">Timelock</span>
                  <span className="font-medium text-gray-900 dark:text-white">{timelockDisplay}</span>
                </div>
                <div className="flex justify-between text-xs xl:text-sm">
                  <span className="text-gray-500 dark:text-zinc-400">Approvals Needed</span>
                  <span className="font-medium text-gray-900 dark:text-white">{approvalsNeeded}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Owner View */}
      {role === 'owner' && status !== 'idle' && !showCancelConfirm && (
        <div className="space-y-3">
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
            <p className="text-xs xl:text-sm text-red-800 dark:text-red-300 font-medium">
              A guardian has initiated recovery on your account.
            </p>
            <p className="text-xs xl:text-sm text-red-700 dark:text-red-400 mt-1">
              If you did not request this, cancel immediately.
            </p>
          </div>

          <button
            onClick={() => setShowCancelConfirm(true)}
            disabled={isLoading || !!actionInProgress}
            className="w-full px-3 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium rounded text-sm xl:text-base transition-colors"
          >
            Cancel Recovery
          </button>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      {showCancelConfirm && (
        <div className="space-y-3">
          <p className="text-sm xl:text-base text-gray-700 dark:text-zinc-300">
            Are you sure you want to cancel this recovery request?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="flex-1 px-3 py-2 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleCancel}
              disabled={!!actionInProgress}
              className="flex-1 px-3 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium rounded text-sm xl:text-base transition-colors"
            >
              {actionInProgress === 'cancel' ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Guardian View - No active recovery */}
      {role === 'guardian' && status === 'idle' && (
        <div className="space-y-3">
          <p className="text-sm xl:text-base text-gray-700 dark:text-zinc-300">
            Initiate recovery to rotate the account{"'"}s signers to the pre-approved recovery owner.
          </p>

          <div>
            <label className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-1 block">
              Recovery Owner Address
            </label>
            <input
              type="text"
              value={recoveryOwner}
              disabled
              className="w-full px-3 py-2 bg-gray-200 dark:bg-zinc-600 border border-gray-300 dark:border-zinc-600 rounded text-xs xl:text-sm text-gray-700 dark:text-zinc-400 font-mono opacity-75 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 dark:text-zinc-400 mt-0.5">
              Pre-configured by the account owner during guardian setup.
            </p>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
            <p className="text-xs xl:text-sm text-amber-800 dark:text-amber-300">
              This starts a 48-hour timelock. The account owner can cancel during this period.
            </p>
          </div>

          <button
            onClick={handleInitiate}
            disabled={!recoveryOwner || !!actionInProgress}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 text-white font-medium rounded text-sm xl:text-base transition-colors"
          >
            {actionInProgress === 'initiate' ? 'Initiating...' : 'Initiate Recovery'}
          </button>
        </div>
      )}

      {/* Guardian View - Active recovery */}
      {role === 'guardian' && status !== 'idle' && status !== 'executed' && status !== 'cancelled' && (
        <div className="space-y-3">
          {approvalsNeeded > 0 && !alreadyApproved && (
            <button
              onClick={handleApprove}
              disabled={!!actionInProgress}
              className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded text-sm xl:text-base transition-colors"
            >
              {actionInProgress === 'approve' ? 'Approving...' : 'Approve Recovery'}
            </button>
          )}

          {alreadyApproved && approvalsNeeded > 0 && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
              <p className="text-xs xl:text-sm text-green-800 dark:text-green-300">
                You have already approved this recovery. Waiting for other guardians.
              </p>
            </div>
          )}

          {canExecute && (
            <button
              onClick={handleExecute}
              disabled={!!actionInProgress}
              className="w-full px-3 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded text-sm xl:text-base transition-colors"
            >
              {actionInProgress === 'execute' ? 'Executing...' : 'Execute Recovery'}
            </button>
          )}
        </div>
      )}

      {/* No role */}
      {role === 'none' && (
        <div className="text-center py-4">
          <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
            {status === 'idle'
              ? 'No active recovery. You are not a signer or guardian of this account.'
              : 'Recovery is in progress. You do not have a role in this account.'}
          </p>
        </div>
      )}

      {/* Idle state for owner */}
      {role === 'owner' && status === 'idle' && (
        <div className="text-center py-4">
          <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
            No active recovery requests.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs xl:text-sm text-red-500 mt-3">{error}</p>
      )}
    </div>
  );
}
