/**
 * NsaAccountInfo Component
 * Displays SmartAccount state, signer list, and navigation to sub-flows
 */

import { useEffect, useState } from 'react';
import {
  useNasunSmartAccount,
  useNsaStore,
  useSigner,
  type NsaSignerInfo,
  type NsaSignerProposal,
} from '@nasun/wallet';
import { CopyableAddress } from '../address/CopyableAddress';

interface NsaAccountInfoProps {
  onClose: () => void;
  onNavigate: (mode: string) => void;
  onAcceptProposal?: (proposalId: string) => void;
}

const SIGNER_TYPE_LABELS: Record<string, string> = {
  zklogin: 'zkLogin',
  passkey: 'Passkey',
  local: 'Local',
  hardware: 'Hardware',
};

function SignerBadge({ info }: { info: NsaSignerInfo }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-white dark:bg-zinc-700 rounded">
      <div className="flex items-center gap-2">
        <span className="text-xs xl:text-sm px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded font-medium">
          {SIGNER_TYPE_LABELS[info.signerType] || info.signerType}
        </span>
        <span className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 truncate max-w-[100px]">
          {info.label || 'Unnamed'}
        </span>
      </div>
      <span className="text-xs xl:text-sm text-gray-400 dark:text-zinc-400 font-mono">
        {info.address.slice(0, 6)}...{info.address.slice(-4)}
      </span>
    </div>
  );
}

function formatTimeRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return 'Expired';
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return '<1h';
}

interface PendingProposalCardProps {
  proposal: NsaSignerProposal;
  currentAddress?: string;
  onAccept?: () => void;
  onCancel?: () => void;
  onDecline?: () => void;
  isLoading?: boolean;
}

function PendingProposalCard({ proposal, currentAddress, onAccept, onCancel, onDecline, isLoading }: PendingProposalCardProps) {
  const [copied, setCopied] = useState(false);
  const isAcceptor = currentAddress && proposal.pendingSigner.toLowerCase() === currentAddress.toLowerCase();
  const isProposer = currentAddress && proposal.proposer.toLowerCase() === currentAddress.toLowerCase();

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(proposal.objectId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = proposal.objectId;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="py-2 px-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs xl:text-sm font-medium text-amber-800 dark:text-amber-300 truncate">
            {proposal.label || 'Unnamed'}
          </span>
          <span
            className="text-[10px] xl:text-xs text-amber-600 dark:text-amber-400 cursor-help"
            title={new Date(proposal.expiresAt).toLocaleString('en-US')}
          >
            {formatTimeRemaining(proposal.expiresAt)}
          </span>
        </div>
        <button
          onClick={handleCopyId}
          className="text-[10px] xl:text-xs text-amber-600 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-300 flex items-center gap-0.5"
          title="Copy Proposal ID"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy ID
            </>
          )}
        </button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] xl:text-xs text-amber-600 dark:text-amber-500 font-mono">
          {proposal.pendingSigner.slice(0, 8)}...{proposal.pendingSigner.slice(-4)}
        </span>
        <div className="flex items-center gap-2">
          {isAcceptor && onAccept && (
            <button
              onClick={onAccept}
              disabled={isLoading}
              className="text-xs xl:text-sm font-medium text-green-700 dark:text-green-400 hover:text-green-900 dark:hover:text-green-200 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 rounded disabled:opacity-50"
            >
              Accept
            </button>
          )}
          {isAcceptor && onDecline && (
            <button
              onClick={onDecline}
              disabled={isLoading}
              className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 disabled:opacity-50"
            >
              {isLoading ? 'Declining...' : 'Decline'}
            </button>
          )}
          {isProposer && onCancel && (
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="text-xs xl:text-sm text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RecoveryReadiness({ accountState }: { accountState: { signers: NsaSignerInfo[]; guardians: string[] } | null }) {
  const hasMultipath = (accountState?.signers?.length ?? 0) >= 2;
  const hasBackup = typeof window !== 'undefined' && localStorage.getItem('nasun:nsa-backup-created') === 'true';
  const hasGuardian = (accountState?.guardians?.length ?? 0) > 0;
  const completed = [hasMultipath, hasBackup, hasGuardian].filter(Boolean).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">Recovery Readiness</span>
        <span className="text-xs xl:text-sm font-medium text-gray-700 dark:text-zinc-300">{completed}/3</span>
      </div>
      <div className="flex gap-1">
        {[hasMultipath, hasBackup, hasGuardian].map((done, i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full ${done ? 'bg-green-500' : 'bg-gray-200 dark:bg-zinc-600'}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] xl:text-xs text-gray-400 dark:text-zinc-400">
        <span>Multipath</span>
        <span>Backup</span>
        <span>Guardian</span>
      </div>
    </div>
  );
}

export function NsaAccountInfo({ onClose, onNavigate, onAcceptProposal }: NsaAccountInfoProps) {
  const { accountState, accountObjectId, isLoading, refreshState, pendingProposals, refreshProposals, cancelSignerProposal, declineSignerProposal } = useNasunSmartAccount();
  const activeRecoveryId = useNsaStore((s) => s.activeRecoveryId);
  const { signer } = useSigner();
  const [decliningProposalId, setDecliningProposalId] = useState<string | null>(null);

  useEffect(() => {
    refreshState();
    refreshProposals();
  }, []);

  const handleDeclineProposal = async (proposalId: string, label: string) => {
    if (!signer) return;

    const confirmed = window.confirm(
      `Decline the invitation "${label}"?\n\nThis action is recorded on-chain. The proposer will see that you declined.`
    );
    if (!confirmed) return;

    setDecliningProposalId(proposalId);
    try {
      await declineSignerProposal(proposalId, signer);
      await refreshProposals();
    } catch (err) {
      console.error('Failed to decline proposal:', err);
      alert('Failed to decline proposal. Please try again.');
    } finally {
      setDecliningProposalId(null);
    }
  };

  const handleCancelProposal = async (proposalId: string, label: string) => {
    if (!signer) return;

    // Show confirmation dialog
    const confirmed = window.confirm(
      `Cancel the proposal for "${label}"?\n\nThe pending signer will no longer be able to accept this invitation.`
    );
    if (!confirmed) return;

    try {
      await cancelSignerProposal(proposalId, signer);
      await refreshProposals();
    } catch (err) {
      console.error('Failed to cancel proposal:', err);
    }
  };

  return (
    <div className="p-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Smart Account</h3>
        </div>
        <button
          onClick={() => refreshState()}
          disabled={isLoading}
          className="text-xs xl:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {isLoading && !accountState ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-3/4" />
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2" />
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-2/3" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Account ID */}
          {accountObjectId && (
            <div className="space-y-1">
              <span className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">Account ID</span>
              <CopyableAddress value={accountObjectId} shorten={10} />
            </div>
          )}

          {/* Recovery Readiness */}
          <RecoveryReadiness accountState={accountState} />

          {/* Signers */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">
                Signers ({accountState?.signers?.length ?? 0}/5)
              </span>
              <span className="text-xs xl:text-sm text-gray-400 dark:text-zinc-400">
                Threshold: {accountState?.threshold ?? 1}
              </span>
            </div>
            <div className="space-y-1">
              {accountState?.signers?.map((s) => (
                <SignerBadge key={s.address} info={s} />
              ))}
            </div>
          </div>

          {/* Pending Proposals */}
          {pendingProposals.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">
                Pending Proposals ({pendingProposals.length})
              </span>
              <div className="space-y-1">
                {pendingProposals.map((p) => (
                  <PendingProposalCard
                    key={p.objectId}
                    proposal={p}
                    currentAddress={signer?.address}
                    onAccept={() => onAcceptProposal?.(p.objectId)}
                    onCancel={() => handleCancelProposal(p.objectId, p.label || 'Unnamed')}
                    onDecline={() => handleDeclineProposal(p.objectId, p.label || 'Unnamed')}
                    isLoading={decliningProposalId === p.objectId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Guardians */}
          <div className="space-y-1">
            <span className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">
              Guardians: {accountState?.guardians?.length ?? 0}
              {accountState?.guardianThreshold ? ` (${accountState.guardianThreshold} required)` : ''}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="space-y-1.5 pt-2 border-t border-gray-200 dark:border-zinc-700">
            <button
              onClick={() => onNavigate('nsa-add-signer')}
              className="w-full px-3 py-2 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Propose Signer
            </button>

            <button
              onClick={() => onNavigate('nsa-accept-proposal')}
              className="w-full px-3 py-2 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Accept Proposal
            </button>

            <button
              onClick={() => onNavigate('nsa-backup')}
              className="w-full px-3 py-2 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="flex-1">Full Backup</span>
              <span className="text-[10px] xl:text-xs text-gray-400 dark:text-zinc-400">Includes guardians</span>
            </button>

            <button
              onClick={() => onNavigate('nsa-restore')}
              className="w-full px-3 py-2 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
              </svg>
              Restore from Backup
            </button>

            <button
              onClick={() => onNavigate('nsa-guardians')}
              className="w-full px-3 py-2 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Guardians
            </button>

            <button
              onClick={() => onNavigate('nsa-guardian-connect')}
              className="w-full px-3 py-2 text-left text-sm xl:text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Recover as Guardian
            </button>

            {activeRecoveryId && (
              <button
                onClick={() => onNavigate('nsa-recovery')}
                className="w-full px-3 py-2 text-left text-sm xl:text-base text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Active Recovery
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
