/**
 * NsaBackupPanel Component
 * Tier 2: Create and download encrypted Smart Account backup (Full Backup).
 *
 * Uses BackupWizard for shared PIN entry flow.
 * v2 backups include on-chain account state (signers, guardians, threshold).
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
  downloadBackupFile,
} from '@nasun/wallet';
import { BackupWizard } from '../backup/BackupWizard';
import { WALLET_STYLES } from '../shared';

interface NsaBackupPanelProps {
  onClose: () => void;
}

export function NsaBackupPanel({ onClose }: NsaBackupPanelProps) {
  const { createNsaBackup } = useNsaBackup();
  const { signer, address, signerType } = useSigner();
  const accountObjectId = useNsaStore((s) => s.accountObjectId);
  const { getKeypair } = useWallet();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);

  // zkLogin: show warning but allow proceeding
  const [zkLoginConfirmed, setZkLoginConfirmed] = useState(false);

  if (signerType === 'zklogin' && !zkLoginConfirmed) {
    return (
      <div className={WALLET_STYLES.panelContainer}>
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className={`${WALLET_STYLES.textBody} font-medium text-gray-900 dark:text-white`}>Full Backup</h3>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded mb-4">
          <p className={`${WALLET_STYLES.textBody} text-blue-800 dark:text-blue-300 font-medium mb-1`}>
            Google account is your primary recovery method
          </p>
          <p className={`${WALLET_STYLES.textLabel} text-blue-700 dark:text-blue-400`}>
            You can restore access by signing in with Google again. For additional protection,
            set up guardians in the Smart Account menu first.
          </p>
        </div>

        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded mb-4">
          <p className={`${WALLET_STYLES.textLabel} text-amber-800 dark:text-amber-300 font-medium mb-1`}>
            Ephemeral key backup has limited usefulness
          </p>
          <p className={`${WALLET_STYLES.textCaption} text-amber-700 dark:text-amber-400`}>
            This backup contains your ephemeral signing key. After re-authenticating with Google,
            a new key is generated, making the backed-up key orphaned. Use only as a last resort
            if you lose both Google access and guardian recovery.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className={`flex-1 py-2.5 ${WALLET_STYLES.secondaryButton}`}
          >
            Cancel
          </button>
          <button
            onClick={() => setZkLoginConfirmed(true)}
            className={`flex-1 py-2.5 ${WALLET_STYLES.primaryButton}`}
          >
            Create Backup Anyway
          </button>
        </div>
      </div>
    );
  }

  const introContent = (
    <div className="space-y-3 mb-4">
      <p className={`${WALLET_STYLES.textBody} text-gray-700 dark:text-zinc-300`}>
        Create an encrypted backup file containing your Smart Account data. This is a full backup
        that includes your account settings.
      </p>

      <div className="p-3 bg-gray-50 dark:bg-zinc-700/50 rounded space-y-2">
        <p className={`${WALLET_STYLES.textLabel} text-gray-700 dark:text-zinc-300 font-medium`}>Included:</p>
        <ul className={`${WALLET_STYLES.textCaption} text-gray-600 dark:text-zinc-400 space-y-1 pl-3`}>
          <li>- Signing key (encrypted with PIN)</li>
          <li>- Smart Account ID and address</li>
          <li>- Signers, guardians, and threshold settings</li>
        </ul>
      </div>

      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
        <p className={`${WALLET_STYLES.textCaption} text-amber-800 dark:text-amber-300 font-medium`}>
          Encrypted with your PIN (PBKDF2 600K + AES-256-GCM). If you forget your PIN, the backup cannot be recovered.
        </p>
      </div>
    </div>
  );

  const handleCreateBackup = async (pin: string): Promise<object> => {
    if (!signer || !address || !accountObjectId) {
      throw new Error('Wallet not connected or Smart Account not found.');
    }

    let signerPrivateKey: string | null = null;
    try {
      const keypair = signerType === 'passkey' ? passkeyKeypair : getKeypair();
      if (!keypair) {
        throw new Error('Cannot access signer key. Please unlock your wallet first.');
      }
      signerPrivateKey = getSecretKeyFromKeypair(keypair);

      const backup = await createNsaBackup(signerPrivateKey, address, pin);

      // Mark backup as created
      localStorage.setItem('nasun:nsa-backup-created', 'true');

      return backup;
    } finally {
      if (signerPrivateKey) secureZeroString(signerPrivateKey);
    }
  };

  const handleDownload = (pkg: object) => {
    const backup = pkg as { accountObjectId?: string };
    const suffix = backup.accountObjectId?.slice(0, 8) ?? 'unknown';
    downloadBackupFile(pkg, `nasun-nsa-backup-${suffix}.json`);
  };

  return (
    <BackupWizard
      title="Full Backup"
      introContent={introContent}
      onCreateBackup={handleCreateBackup}
      onDownload={handleDownload}
      onClose={onClose}
    />
  );
}
