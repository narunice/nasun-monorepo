/**
 * NsaAcceptProposal Component
 * Accept a pending signer proposal (Phase 2 of 2-phase signer addition).
 *
 * The pending signer enters their proposal ID and signs the transaction
 * to prove ownership and complete registration as a signer.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  useNasunSmartAccount,
  useSigner,
  fetchSignerProposal,
  type NsaSignerProposal,
} from '@nasun/wallet';

interface NsaAcceptProposalProps {
  onClose: () => void;
  initialProposalId?: string;
}

type Step = 'input' | 'review' | 'submitting' | 'success' | 'error';

const SIGNER_TYPE_LABELS: Record<string, string> = {
  zklogin: 'zkLogin (OAuth)',
  passkey: 'Passkey (Face ID / Fingerprint)',
  local: 'Local Keypair',
  hardware: 'Hardware Wallet',
};

function formatTimeRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return 'Expired';

  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;
  return 'Less than 1 hour';
}

export function NsaAcceptProposal({ onClose, initialProposalId = '' }: NsaAcceptProposalProps) {
  const [step, setStep] = useState<Step>('input');
  const [proposalId, setProposalId] = useState(initialProposalId);
  const [proposal, setProposal] = useState<NsaSignerProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { acceptSignerProposal, accountObjectId } = useNasunSmartAccount();
  const { signer } = useSigner();

  // Auto-fetch when initialProposalId is provided (skip input step)
  useEffect(() => {
    if (initialProposalId && step === 'input' && !isLoading && !proposal) {
      fetchProposalById(initialProposalId);
    }
  }, [initialProposalId]);

  // Fetch proposal by ID (used by both auto-fetch and manual input)
  const fetchProposalById = useCallback(async (id: string) => {
    if (!id.trim()) {
      setError('Please enter a proposal ID');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const fetched = await fetchSignerProposal(id.trim());

      // Validate proposal state
      if (fetched.isExecuted) {
        setError('This proposal has already been executed');
        setIsLoading(false);
        return;
      }
      if (fetched.isCancelled) {
        setError('This proposal has been cancelled');
        setIsLoading(false);
        return;
      }
      if (fetched.expiresAt <= Date.now()) {
        setError('This proposal has expired');
        setIsLoading(false);
        return;
      }

      // Validate signer address matches current wallet
      if (signer && fetched.pendingSigner.toLowerCase() !== signer.address.toLowerCase()) {
        setError(
          `This proposal is for address ${fetched.pendingSigner.slice(0, 8)}...${fetched.pendingSigner.slice(-6)}, but your wallet is ${signer.address.slice(0, 8)}...${signer.address.slice(-6)}`
        );
        setIsLoading(false);
        return;
      }

      setProposal(fetched);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch proposal');
    } finally {
      setIsLoading(false);
    }
  }, [signer]);

  const fetchProposal = useCallback(async () => {
    await fetchProposalById(proposalId);
  }, [proposalId, fetchProposalById]);

  const handleAccept = async () => {
    if (!signer || !proposal) {
      setError('No active signer or proposal');
      return;
    }

    setStep('submitting');
    setError(null);

    try {
      await acceptSignerProposal(proposal.objectId, signer);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept proposal');
      setStep('error');
    }
  };

  // Input step - enter proposal ID
  if (step === 'input') {
    return (
      <div className="p-4 w-full">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Accept Proposal</h3>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded mb-4">
          <p className="text-xs text-blue-800 dark:text-blue-300">
            Enter the proposal ID shared with you to become a signer on someone's Smart Account.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Proposal ID</label>
            <input
              type="text"
              value={proposalId}
              onChange={(e) => setProposalId(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={fetchProposal}
            disabled={!proposalId.trim() || isLoading}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 text-white font-medium rounded text-sm transition-colors"
          >
            {isLoading ? 'Loading...' : 'Look Up Proposal'}
          </button>
        </div>
      </div>
    );
  }

  // Review step - show proposal details
  if (step === 'review' && proposal) {
    return (
      <div className="p-4 w-full">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setStep('input')}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Proposal Details</h3>
        </div>

        <div className="space-y-3 mb-4">
          {/* Account info section */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Smart Account</p>
            <p className="text-xs font-mono text-blue-800 dark:text-blue-300">
              {proposal.accountId.slice(0, 10)}...{proposal.accountId.slice(-8)}
            </p>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-zinc-700/50 rounded space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-zinc-400">Your Role</span>
              <span className="text-gray-900 dark:text-white">{proposal.label}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-zinc-400">Signer Type</span>
              <span className="text-gray-900 dark:text-white">
                {SIGNER_TYPE_LABELS[proposal.signerType] || proposal.signerType}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-zinc-400">Weight</span>
              <span className="text-gray-900 dark:text-white">{proposal.weight}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-zinc-400">Expires</span>
              <span
                className="text-gray-900 dark:text-white cursor-help"
                title={new Date(proposal.expiresAt).toLocaleString('en-US')}
              >
                {formatTimeRemaining(proposal.expiresAt)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-zinc-400">Invited by</span>
              <span className="text-gray-900 dark:text-white font-mono text-xs">
                {proposal.proposer.slice(0, 8)}...{proposal.proposer.slice(-6)}
              </span>
            </div>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              By accepting, you will become a signer on the Smart Account. You will be able to authorize transactions up to your weight limit.
            </p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setStep('input')}
            className="flex-1 px-3 py-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 px-3 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded text-sm transition-colors"
          >
            Accept & Sign
          </button>
        </div>
      </div>
    );
  }

  // Submitting step
  if (step === 'submitting') {
    return (
      <div className="p-4 w-full">
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-700 dark:text-zinc-300">Accepting proposal...</p>
        </div>
      </div>
    );
  }

  // Error step
  if (step === 'error') {
    return (
      <div className="p-4 w-full">
        <div className="flex flex-col items-center py-6">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Failed to Accept</h3>
          <p className="text-xs text-gray-500 dark:text-zinc-400 text-center mb-4">
            {error || 'An error occurred while accepting the proposal.'}
          </p>
          <button
            onClick={() => setStep('review')}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Success step
  return (
    <div className="p-4 w-full">
      <div className="flex flex-col items-center py-6">
        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Signer Added</h3>
        <p className="text-xs text-gray-500 dark:text-zinc-400 text-center mb-4">
          You are now a signer on the Smart Account with label "{proposal?.label}".
        </p>
        <button
          onClick={onClose}
          className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
