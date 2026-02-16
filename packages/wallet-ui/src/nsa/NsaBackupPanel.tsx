/**
 * NsaBackupPanel Component
 * Tier 2: Create and download encrypted backup
 */

import { useState } from 'react';
import {
  useNsaBackup,
  useSigner,
  useNsaStore,
  useWallet,
  usePasskeyStore,
  getSecretKeyFromKeypair,
  secureZeroString,
} from '@nasun/wallet';

interface NsaBackupPanelProps {
  onClose: () => void;
}

type Step = 'intro' | 'set-pin' | 'confirm-pin' | 'creating' | 'download';

export function NsaBackupPanel({ onClose }: NsaBackupPanelProps) {
  const [step, setStep] = useState<Step>('intro');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { createNsaBackup, downloadBackup } = useNsaBackup();
  const { signer, address, signerType } = useSigner();
  const accountObjectId = useNsaStore((s) => s.accountObjectId);
  const { getKeypair } = useWallet();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);

  const [backupData, setBackupData] = useState<Awaited<ReturnType<typeof createNsaBackup>> | null>(null);
  const [hasDownloaded, setHasDownloaded] = useState(false);

  const handleCreateBackup = async () => {
    if (!signer || !address || !accountObjectId) {
      setError('Wallet not connected or Smart Account not found.');
      setStep('set-pin');
      return;
    }

    setStep('creating');
    setError(null);

    let signerPrivateKey: string | null = null;
    try {
      // Extract the actual private key based on signer type
      const keypair = signerType === 'passkey' ? passkeyKeypair : getKeypair();
      if (!keypair) {
        setError('Cannot access signer key. Please unlock your wallet first.');
        setStep('set-pin');
        return;
      }
      signerPrivateKey = getSecretKeyFromKeypair(keypair);

      const backup = await createNsaBackup(signerPrivateKey, address, pin);
      setBackupData(backup);

      // Mark backup as created
      localStorage.setItem('nasun:nsa-backup-created', 'true');

      setStep('download');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create backup');
      setStep('set-pin');
    } finally {
      if (signerPrivateKey) secureZeroString(signerPrivateKey);
    }
  };

  const handleDownload = () => {
    if (backupData) {
      downloadBackup(backupData);
      setHasDownloaded(true);
    }
  };

  // zkLogin users don't need backup — re-authenticate via OAuth to restore access
  if (signerType === 'zklogin') {
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
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Encrypted Backup</h3>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded mb-4">
          <p className="text-sm xl:text-base text-blue-800 dark:text-blue-300 font-medium mb-1">
            Backup is not needed for zkLogin accounts
          </p>
          <p className="text-xs xl:text-sm text-blue-700 dark:text-blue-400">
            Your Smart Account is linked to your Google account. You can restore access by signing in again — no backup file required.
          </p>
        </div>

        <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-4">
          For additional protection, set up guardians in the Smart Account menu. Guardians can help you recover access even if you lose your Google account.
        </p>

        <button
          onClick={onClose}
          className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm xl:text-base transition-colors"
        >
          Got it
        </button>
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
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Encrypted Backup</h3>
        </div>

        <div className="space-y-3 mb-4">
          <p className="text-sm xl:text-base text-gray-700 dark:text-zinc-300">
            Create an encrypted backup file to restore your Smart Account access if you lose all your devices.
          </p>

          <div className="p-3 bg-gray-50 dark:bg-zinc-700/50 rounded space-y-2 text-xs xl:text-sm text-gray-600 dark:text-zinc-400">
            <p>- Encrypted with your PIN (PBKDF2 600K iterations + AES-256-GCM)</p>
            <p>- Decryption happens entirely on your device</p>
            <p>- Store the file in a secure location (cloud drive, USB, etc.)</p>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
            <p className="text-xs xl:text-sm text-amber-800 dark:text-amber-300 font-medium">
              If you forget your PIN, the backup cannot be recovered.
            </p>
          </div>
        </div>

        <button
          onClick={() => setStep('set-pin')}
          className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm xl:text-base transition-colors"
        >
          Create Backup
        </button>
      </div>
    );
  }

  // Set PIN step
  if (step === 'set-pin') {
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
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Set Backup PIN</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-1 block">PIN (6+ characters)</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter a secure PIN"
              className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-sm xl:text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            {pin.length > 0 && pin.length < 6 && (
              <p className="text-xs xl:text-sm text-red-400 mt-1">PIN must be at least 6 characters</p>
            )}
          </div>

          {error && <p className="text-xs xl:text-sm text-red-500">{error}</p>}

          <button
            onClick={() => setStep('confirm-pin')}
            disabled={pin.length < 6}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 text-white font-medium rounded text-sm xl:text-base transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Confirm PIN step
  if (step === 'confirm-pin') {
    const pinsMatch = confirmPin === pin;

    return (
      <div className="p-4 w-full">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => { setConfirmPin(''); setStep('set-pin'); }}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">Confirm PIN</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-1 block">Re-enter PIN</label>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="Confirm your PIN"
              onKeyDown={(e) => e.key === 'Enter' && pinsMatch && handleCreateBackup()}
              className="w-full px-3 py-2 bg-gray-100 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 rounded text-sm xl:text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            {confirmPin.length > 0 && !pinsMatch && (
              <p className="text-xs xl:text-sm text-red-400 mt-1">PINs do not match</p>
            )}
          </div>

          <button
            onClick={handleCreateBackup}
            disabled={!pinsMatch}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 text-white font-medium rounded text-sm xl:text-base transition-colors"
          >
            Create Backup
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
          <p className="text-sm xl:text-base text-gray-700 dark:text-zinc-300">Encrypting backup...</p>
          <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mt-1">This may take a moment</p>
        </div>
      </div>
    );
  }

  // Download step
  return (
    <div className="p-4 w-full">
      <div className="flex flex-col items-center py-6">
        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-sm xl:text-base font-medium text-gray-900 dark:text-white mb-1">Backup Created</h3>
        <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 text-center mb-4">
          Store this file in a secure location. You will need your PIN to restore.
        </p>

        <div className="w-full space-y-2">
          <button
            onClick={handleDownload}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm xl:text-base transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {hasDownloaded ? 'Download Again' : 'Download Backup'}
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
