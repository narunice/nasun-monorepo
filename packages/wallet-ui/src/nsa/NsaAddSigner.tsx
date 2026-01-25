/**
 * NsaAddSigner Component
 * Form to propose adding a new signer to the SmartAccount.
 *
 * 2-Phase Signer Addition:
 * Phase 1: Existing signer proposes a new signer (this component)
 * Phase 2: Pending signer accepts the proposal (NsaAcceptProposal)
 */

import { useState } from 'react';
import {
  useNasunSmartAccount,
  useSigner,
  type NsaSignerType,
} from '@nasun/wallet';

interface NsaAddSignerProps {
  onClose: () => void;
}

type Step = 'form' | 'confirm' | 'submitting' | 'success';

const SIGNER_TYPES: { value: NsaSignerType; label: string }[] = [
  { value: 'passkey', label: 'Passkey (Face ID / Fingerprint)' },
  { value: 'zklogin', label: 'zkLogin (OAuth)' },
  { value: 'local', label: 'Local Keypair' },
  { value: 'hardware', label: 'Hardware Wallet' },
];

function isValidSuiAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(addr);
}

export function NsaAddSigner({ onClose }: NsaAddSignerProps) {
  const [step, setStep] = useState<Step>('form');
  const [address, setAddress] = useState('');
  const [signerType, setSignerType] = useState<NsaSignerType>('passkey');
  const [weight, setWeight] = useState(1);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);

  const { proposeAddSigner, accountState } = useNasunSmartAccount();
  const { signer } = useSigner();

  const isAddressValid = isValidSuiAddress(address);
  const isLabelValid = label.length > 0 && label.length <= 32;
  const isFormValid = isAddressValid && isLabelValid && weight >= 1;

  const isDuplicate = accountState?.signers?.some(
    (s) => s.address.toLowerCase() === address.toLowerCase()
  );

  const handleSubmit = async () => {
    if (!signer) {
      setError('No active signer. Please connect your wallet.');
      return;
    }

    setStep('submitting');
    setError(null);

    try {
      const createdProposalId = await proposeAddSigner(address, signerType, weight, label, signer);
      setProposalId(createdProposalId);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create proposal');
      setStep('confirm');
    }
  };

  // Form step
  if (step === 'form') {
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
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Propose Signer</h3>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded mb-4">
          <p className="text-xs text-blue-800 dark:text-blue-300">
            This creates a proposal. The new signer must accept it from their wallet to complete registration.
          </p>
        </div>

        <div className="space-y-3">
          {/* Address */}
          <div>
            <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Signer Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            {address && !isAddressValid && (
              <p className="text-xs text-red-400 mt-1">Invalid Sui address format</p>
            )}
            {isDuplicate && (
              <p className="text-xs text-red-400 mt-1">This address is already a signer</p>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Signer Type</label>
            <select
              value={signerType}
              onChange={(e) => setSignerType(e.target.value as NsaSignerType)}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SIGNER_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Label */}
          <div>
            <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 32))}
              placeholder="e.g. MacBook Passkey"
              className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{label.length}/32</p>
          </div>

          {/* Weight */}
          <div>
            <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Weight</label>
            <input
              type="number"
              min={1}
              max={10}
              value={weight}
              onChange={(e) => setWeight(Math.max(1, Math.min(10, Number(e.target.value))))}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={() => setStep('confirm')}
            disabled={!isFormValid || !!isDuplicate}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 text-white font-medium rounded text-sm transition-colors mt-2"
          >
            Review Proposal
          </button>
        </div>
      </div>
    );
  }

  // Confirm step
  if (step === 'confirm') {
    return (
      <div className="p-4 w-full">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setStep('form')}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Confirm Proposal</h3>
        </div>

        <div className="space-y-3 mb-4">
          <div className="p-3 bg-gray-50 dark:bg-zinc-700/50 rounded space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-zinc-400">Address</span>
              <span className="text-gray-900 dark:text-white font-mono text-xs">
                {address.slice(0, 8)}...{address.slice(-6)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-zinc-400">Type</span>
              <span className="text-gray-900 dark:text-white">
                {SIGNER_TYPES.find((t) => t.value === signerType)?.label}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-zinc-400">Label</span>
              <span className="text-gray-900 dark:text-white">{label}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-zinc-400">Weight</span>
              <span className="text-gray-900 dark:text-white">{weight}</span>
            </div>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              The proposal expires in 7 days. The owner of the address must accept it to become a signer.
            </p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setStep('form')}
            className="flex-1 px-3 py-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm transition-colors"
          >
            Create Proposal
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
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-700 dark:text-zinc-300">Creating proposal...</p>
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
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Proposal Created</h3>
        <p className="text-xs text-gray-500 dark:text-zinc-400 text-center mb-3">
          Share the proposal ID with "{label}" so they can accept it.
        </p>

        {proposalId && (
          <div className="w-full p-3 bg-gray-100 dark:bg-zinc-700 rounded mb-4">
            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">Proposal ID</p>
            <p className="text-xs font-mono text-gray-900 dark:text-white break-all">
              {proposalId}
            </p>
          </div>
        )}

        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded w-full mb-4">
          <p className="text-xs text-blue-800 dark:text-blue-300">
            The new signer must go to "Accept Proposal" in their wallet and sign with the proposed address to complete registration.
          </p>
        </div>

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
