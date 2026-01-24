/**
 * NsaGuardianSetup Component
 * Configure guardians for Tier 3 social recovery
 */

import { useState } from 'react';
import {
  useNasunSmartAccount,
  useSigner,
} from '@nasun/wallet';

interface NsaGuardianSetupProps {
  onClose: () => void;
}

type Step = 'form' | 'review' | 'submitting' | 'success';

function isValidSuiAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(addr);
}

export function NsaGuardianSetup({ onClose }: NsaGuardianSetupProps) {
  const [step, setStep] = useState<Step>('form');
  const [guardians, setGuardians] = useState<string[]>(['', '']);
  const [threshold, setThreshold] = useState(2);
  const [recoveryOwner, setRecoveryOwner] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { setGuardians: submitGuardians, accountState } = useNasunSmartAccount();
  const { signer, address } = useSigner();

  // Default recovery owner to current address
  const effectiveRecoveryOwner = recoveryOwner || address || '';

  const validGuardians = guardians.filter((g) => isValidSuiAddress(g));
  const hasOverlap = accountState?.signers?.some((s) =>
    validGuardians.includes(s.address)
  );
  const isFormValid =
    validGuardians.length >= 2 &&
    threshold >= 1 &&
    threshold <= validGuardians.length &&
    isValidSuiAddress(effectiveRecoveryOwner) &&
    !hasOverlap;

  const addGuardian = () => {
    if (guardians.length < 5) {
      setGuardians([...guardians, '']);
    }
  };

  const removeGuardian = (index: number) => {
    if (guardians.length > 2) {
      setGuardians(guardians.filter((_, i) => i !== index));
      setThreshold(Math.min(threshold, guardians.length - 1));
    }
  };

  const updateGuardian = (index: number, value: string) => {
    const updated = [...guardians];
    updated[index] = value;
    setGuardians(updated);
  };

  const handleSubmit = async () => {
    if (!signer) {
      setError('No active signer.');
      return;
    }

    setStep('submitting');
    setError(null);

    try {
      await submitGuardians(validGuardians, threshold, effectiveRecoveryOwner, signer);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set guardians');
      setStep('review');
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
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Guardian Setup</h3>
        </div>

        <div className="space-y-3">
          {/* Guardian addresses */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500 dark:text-zinc-400">Guardian Addresses</label>
              <button
                onClick={addGuardian}
                disabled={guardians.length >= 5}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 disabled:opacity-50"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {guardians.map((g, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    type="text"
                    value={g}
                    onChange={(e) => updateGuardian(i, e.target.value)}
                    placeholder={`Guardian ${i + 1} address (0x...)`}
                    className="flex-1 px-2 py-1.5 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                  {guardians.length > 2 && (
                    <button
                      onClick={() => removeGuardian(i)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Threshold */}
          <div>
            <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">
              Approval Threshold ({threshold} of {validGuardians.length})
            </label>
            <input
              type="range"
              min={1}
              max={Math.max(1, validGuardians.length)}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full"
            />
            {threshold === 1 && validGuardians.length > 1 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                A single guardian can initiate recovery. Consider using a higher threshold.
              </p>
            )}
          </div>

          {/* Recovery Owner */}
          <div>
            <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Recovery Owner</label>
            <input
              type="text"
              value={recoveryOwner}
              onChange={(e) => setRecoveryOwner(e.target.value)}
              placeholder={address ? `Default: ${address.slice(0, 10)}...` : '0x...'}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
              Recovery will restore access to this address only.
            </p>
          </div>

          {hasOverlap && (
            <p className="text-xs text-red-500">Guardian addresses cannot overlap with existing signers.</p>
          )}

          <button
            onClick={() => setStep('review')}
            disabled={!isFormValid}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 text-white font-medium rounded text-sm transition-colors mt-2"
          >
            Review
          </button>
        </div>
      </div>
    );
  }

  // Review step
  if (step === 'review') {
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
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Review Guardians</h3>
        </div>

        <div className="space-y-3 mb-4">
          <div className="p-3 bg-gray-50 dark:bg-zinc-700/50 rounded space-y-2">
            <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium">
              {validGuardians.length} guardians, {threshold} required to recover
            </p>
            {validGuardians.map((g, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 dark:text-zinc-500">#{i + 1}</span>
                <span className="font-mono text-gray-900 dark:text-white">
                  {g.slice(0, 8)}...{g.slice(-6)}
                </span>
              </div>
            ))}
            <div className="pt-1 border-t border-gray-200 dark:border-zinc-600 mt-1">
              <span className="text-xs text-gray-500 dark:text-zinc-400">Recovery to: </span>
              <span className="text-xs font-mono text-gray-900 dark:text-white">
                {effectiveRecoveryOwner.slice(0, 8)}...{effectiveRecoveryOwner.slice(-6)}
              </span>
            </div>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
            <p className="text-xs text-blue-800 dark:text-blue-300">
              Recovery requires {threshold} guardian approvals + 48-hour timelock. You can cancel during the timelock period.
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
            Confirm
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
          <p className="text-sm text-gray-700 dark:text-zinc-300">Setting up guardians...</p>
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
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Guardians Configured</h3>
        <p className="text-xs text-gray-500 dark:text-zinc-400 text-center mb-4">
          {validGuardians.length} guardians set with {threshold}-of-{validGuardians.length} threshold.
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
