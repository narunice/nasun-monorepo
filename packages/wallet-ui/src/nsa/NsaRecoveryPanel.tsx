/**
 * NsaRecoveryPanel Component
 * Guardian recovery flow: initiate, approve, execute, cancel
 */

import { useState } from 'react';
import {
  useNsaRecovery,
  useNasunSmartAccount,
  useSigner,
} from '@nasun/wallet';

interface NsaRecoveryPanelProps {
  onClose: () => void;
}

type Role = 'owner' | 'guardian' | 'none';

function isValidSuiAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(addr);
}

export function NsaRecoveryPanel({ onClose }: NsaRecoveryPanelProps) {
  const [newOwnerInput, setNewOwnerInput] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const {
    status,
    timelockDisplay,
    approvalsNeeded,
    canExecute,
    initiateRecovery,
    approveRecovery,
    executeRecovery,
    cancelRecovery,
    isLoading,
  } = useNsaRecovery();

  const { accountState } = useNasunSmartAccount();
  const { signer, address } = useSigner();

  // Determine user role
  const isSigner = accountState?.signers?.some((s) => s.address === address);
  const isGuardian = accountState?.guardians?.includes(address || '');
  const role: Role = isSigner ? 'owner' : isGuardian ? 'guardian' : 'none';

  const handleInitiate = async () => {
    if (!signer || !isValidSuiAddress(newOwnerInput)) return;
    setActionInProgress('initiate');
    setError(null);
    try {
      await initiateRecovery(newOwnerInput, signer);
      setNewOwnerInput('');
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
            <div className="flex justify-between text-xs">
              <span className="text-gray-500 dark:text-zinc-400">Status</span>
              <span className="font-medium text-gray-900 dark:text-white capitalize">
                {status.replace(/_/g, ' ')}
              </span>
            </div>
            {(status === 'timelock_active' || status === 'pending_approvals') && (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500 dark:text-zinc-400">Timelock</span>
                  <span className="font-medium text-gray-900 dark:text-white">{timelockDisplay}</span>
                </div>
                <div className="flex justify-between text-xs">
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
            <p className="text-xs text-red-800 dark:text-red-300 font-medium">
              A guardian has initiated recovery on your account.
            </p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-1">
              If you did not request this, cancel immediately.
            </p>
          </div>

          <button
            onClick={() => setShowCancelConfirm(true)}
            disabled={isLoading || !!actionInProgress}
            className="w-full px-3 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium rounded text-sm transition-colors"
          >
            Cancel Recovery
          </button>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      {showCancelConfirm && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-zinc-300">
            Are you sure you want to cancel this recovery request?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="flex-1 px-3 py-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleCancel}
              disabled={!!actionInProgress}
              className="flex-1 px-3 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium rounded text-sm transition-colors"
            >
              {actionInProgress === 'cancel' ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      )}

      {/* Guardian View - No active recovery */}
      {role === 'guardian' && status === 'idle' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-zinc-300">
            Initiate recovery to rotate the account{"'"}s signers to a new owner address.
          </p>

          <div>
            <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">New Owner Address</label>
            <input
              type="text"
              value={newOwnerInput}
              onChange={(e) => setNewOwnerInput(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
            {newOwnerInput && !isValidSuiAddress(newOwnerInput) && (
              <p className="text-xs text-red-400 mt-1">Invalid address format</p>
            )}
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              This starts a 48-hour timelock. The account owner can cancel during this period.
            </p>
          </div>

          <button
            onClick={handleInitiate}
            disabled={!isValidSuiAddress(newOwnerInput) || !!actionInProgress}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 text-white font-medium rounded text-sm transition-colors"
          >
            {actionInProgress === 'initiate' ? 'Initiating...' : 'Initiate Recovery'}
          </button>
        </div>
      )}

      {/* Guardian View - Active recovery */}
      {role === 'guardian' && status !== 'idle' && status !== 'executed' && status !== 'cancelled' && (
        <div className="space-y-3">
          {approvalsNeeded > 0 && (
            <button
              onClick={handleApprove}
              disabled={!!actionInProgress}
              className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded text-sm transition-colors"
            >
              {actionInProgress === 'approve' ? 'Approving...' : 'Approve Recovery'}
            </button>
          )}

          {canExecute && (
            <button
              onClick={handleExecute}
              disabled={!!actionInProgress}
              className="w-full px-3 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded text-sm transition-colors"
            >
              {actionInProgress === 'execute' ? 'Executing...' : 'Execute Recovery'}
            </button>
          )}
        </div>
      )}

      {/* No role */}
      {role === 'none' && (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {status === 'idle'
              ? 'No active recovery. You are not a signer or guardian of this account.'
              : 'Recovery is in progress. You do not have a role in this account.'}
          </p>
        </div>
      )}

      {/* Idle state for owner */}
      {role === 'owner' && status === 'idle' && (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            No active recovery requests.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500 mt-3">{error}</p>
      )}
    </div>
  );
}
