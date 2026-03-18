/**
 * NsaBackupPanel Component
 * Tier 2: Create and download encrypted Smart Account backup (Full Backup).
 *
 * Uses BackupWizard for shared PIN entry flow.
 * v2 backups include on-chain account state (signers, guardians, threshold).
 *
 * zkLogin users are blocked from backup because the ephemeral key changes
 * on every Google re-authentication, making the backup file unusable.
 */

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
import type { NsaSigner } from '@nasun/wallet';
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

  // Resolve the underlying signer type (NsaSigner wraps the real signer)
  const underlyingType = signerType === 'nsa' && signer
    ? (signer as NsaSigner).underlyingType
    : signerType;
  const isZkLoginBased = underlyingType === 'zklogin';
  const isPasskeyBased = underlyingType === 'passkey';

  // zkLogin: block backup (ephemeral key becomes orphaned on Google re-auth)
  if (isZkLoginBased) {
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
            Not available for zkLogin accounts
          </p>
          <p className={`${WALLET_STYLES.textLabel} text-blue-700 dark:text-blue-400`}>
            Your wallet uses a temporary signing key that changes each time you
            sign in with Google, so a backup file would not be usable for recovery.
          </p>
        </div>

        <div className="p-3 bg-gray-50 dark:bg-zinc-700/50 rounded mb-4">
          <p className={`${WALLET_STYLES.textLabel} text-gray-700 dark:text-zinc-300 font-medium mb-1`}>
            How to protect your account
          </p>
          <p className={`${WALLET_STYLES.textCaption} text-gray-600 dark:text-zinc-400`}>
            Add a passkey or local wallet as a backup signer via "Propose Signer".
            Once added, you can create a full backup with that signer. You can also
            set up guardians for emergency recovery.
          </p>
        </div>

        <button onClick={onClose} className={`w-full py-2.5 ${WALLET_STYLES.primaryButton}`}>
          Got it
        </button>
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
      const keypair = isPasskeyBased ? passkeyKeypair : getKeypair();
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
