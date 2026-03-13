/**
 * NsaSetupWizard Component
 * First-time SmartAccount creation flow
 */

import { useState, useEffect } from 'react';
import {
  useNasunSmartAccount,
  useSigner,
  type NsaSignerType,
} from '@nasun/wallet';

interface NsaSetupWizardProps {
  onClose: () => void;
  onSuccess: () => void;
  onRestoreFromBackup?: () => void;
  onRecoverAsGuardian?: () => void;
}

type Step = 'checking' | 'intro' | 'found' | 'confirm' | 'creating' | 'success';

export function NsaSetupWizard({ onClose, onSuccess, onRestoreFromBackup, onRecoverAsGuardian }: NsaSetupWizardProps) {
  const [step, setStep] = useState<Step>('checking');
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const { createAccount, discoverAndInitialize } = useNasunSmartAccount();
  const { signer, signerType } = useSigner();

  // Auto-discover existing SmartAccount when wizard opens
  useEffect(() => {
    if (!signer) {
      setStep('intro');
      return;
    }

    let cancelled = false;

    const discover = async () => {
      try {
        const found = await discoverAndInitialize(signer.address);
        if (cancelled) return;

        if (found) {
          setStep('found');
        } else {
          setStep('intro');
        }
      } catch {
        if (!cancelled) setStep('intro');
      }
    };

    discover();
    return () => { cancelled = true; };
  }, [signer, discoverAndInitialize]);

  const handleCreate = async () => {
    if (!signer) {
      setError('No signer available. Please connect your wallet first.');
      return;
    }

    setStep('creating');
    setError(null);

    try {
      // Map signer type to NSA signer type
      const nsaSignerType: NsaSignerType =
        signerType === 'zklogin' ? 'zklogin' :
        signerType === 'passkey' ? 'passkey' :
        signerType === 'local' ? 'local' :
        'local';

      const label = signerType === 'zklogin' ? 'primary-zklogin'
        : signerType === 'passkey' ? 'primary-passkey'
        : 'primary-key';
      const objectId = await createAccount(nsaSignerType, label, signer);
      setCreatedId(objectId);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Smart Account');
      setStep('confirm');
    }
  };

  // Checking step — discovery in progress
  if (step === 'checking') {
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
          <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white">Smart Account</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm xl:text-base text-gray-700 dark:text-zinc-300">Checking for existing account...</p>
          <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mt-1">This only takes a moment</p>
        </div>
      </div>
    );
  }

  // Found step — existing account discovered
  if (step === 'found') {
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
          <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white">Smart Account</h3>
        </div>

        <div className="flex flex-col items-center py-6">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-sm xl:text-base font-medium text-gray-900 dark:text-white mb-1">Smart Account Found</h3>
          <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-4">
            An existing account was found for this wallet.
          </p>

          <div className="w-full space-y-2">
            <button
              onClick={onSuccess}
              className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm xl:text-base transition-colors"
            >
              Connect to Existing Account
            </button>
            <button
              onClick={onClose}
              className="w-full px-3 py-2 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Intro step
  if (step === 'intro') {
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
          <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white">Create Smart Account</h3>
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <div>
              <p className="text-sm xl:text-base font-medium text-gray-900 dark:text-white">Key-Account Separation</p>
              <p className="text-xs xl:text-sm text-gray-600 dark:text-zinc-400 mt-0.5">
                Your assets stay safe in a permanent vault, independent of any single key.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <div>
              <p className="text-sm xl:text-base font-medium text-gray-900 dark:text-white">Key Rotation</p>
              <p className="text-xs xl:text-sm text-gray-600 dark:text-zinc-400 mt-0.5">
                Lost a key? Rotate it without moving your assets.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div>
              <p className="text-sm xl:text-base font-medium text-gray-900 dark:text-white">Never Lose Access</p>
              <p className="text-xs xl:text-sm text-gray-600 dark:text-zinc-400 mt-0.5">
                Recover from anything: multiple login methods, encrypted backup, and trusted guardians.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setStep('confirm')}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm xl:text-base transition-colors"
          >
            Continue
          </button>

          {onRestoreFromBackup && (
            <button
              onClick={onRestoreFromBackup}
              className="w-full px-3 py-2.5 text-sm xl:text-base text-gray-600 dark:text-zinc-300 border border-gray-300 dark:border-zinc-600 rounded hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
            >
              Restore from backup .json file
            </button>
          )}

          {onRecoverAsGuardian && (
            <button
              onClick={onRecoverAsGuardian}
              className="w-full px-3 py-2.5 text-sm xl:text-base text-gray-600 dark:text-zinc-300 border border-gray-300 dark:border-zinc-600 rounded hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
            >
              Recover as Guardian
            </button>
          )}
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
            onClick={() => setStep('intro')}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white">Confirm Creation</h3>
        </div>

        <div className="space-y-3 mb-4">
          <div className="p-3 bg-gray-50 dark:bg-zinc-700/50 rounded space-y-2">
            <div className="flex justify-between text-sm xl:text-base">
              <span className="text-gray-500 dark:text-zinc-400">Signer Type</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {signerType === 'zklogin' ? 'zkLogin' : signerType === 'local' ? 'Local Key' : signerType === 'passkey' ? 'Passkey' : signerType || 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between text-sm xl:text-base">
              <span className="text-gray-500 dark:text-zinc-400">Network Fee</span>
              <span className="text-gray-900 dark:text-white font-medium">~0.05 NASUN</span>
            </div>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
            <p className="text-xs xl:text-sm text-amber-800 dark:text-amber-300">
              This creates an on-chain Smart Account. A small gas fee will be charged.
            </p>
          </div>

          {error && (
            <p className="text-xs xl:text-sm text-red-500 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!signer}
            className="flex-1 px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 text-white font-medium rounded text-sm xl:text-base transition-colors"
          >
            Create Account
          </button>
        </div>
      </div>
    );
  }

  // Creating step
  if (step === 'creating') {
    return (
      <div className="p-4 w-full">
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm xl:text-base text-gray-700 dark:text-zinc-300">Creating Smart Account...</p>
          <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mt-1">Confirming transaction on-chain</p>
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
        <h3 className="text-sm xl:text-base font-medium text-gray-900 dark:text-white mb-1">Smart Account Created</h3>
        {createdId && (
          <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 font-mono mb-4">
            {createdId.slice(0, 10)}...{createdId.slice(-6)}
          </p>
        )}

        <div className="w-full space-y-2">
          <button
            onClick={onSuccess}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm xl:text-base transition-colors"
          >
            View Account
          </button>
          <button
            onClick={onClose}
            className="w-full px-3 py-2 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
