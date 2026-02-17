/**
 * WalletBackupPanel - Wallet-level backup (no Smart Account required)
 *
 * Available for self-custody and passkey users.
 * zkLogin users see an informational message directing them to Smart Account Backup.
 */

import {
  useWalletBackup,
  useSigner,
  useWallet,
  usePasskeyStore,
  getSecretKeyFromKeypair,
  secureZeroString,
  type WalletBackupPackage,
} from "@nasun/wallet";
import { BackupWizard } from "./BackupWizard";
import { WALLET_STYLES } from "../shared";

interface WalletBackupPanelProps {
  onClose: () => void;
}

export function WalletBackupPanel({ onClose }: WalletBackupPanelProps) {
  const { signerType, address } = useSigner();
  const { getKeypair } = useWallet();
  const passkeyKeypair = usePasskeyStore((s) => s.keypair);
  const { createBackup, downloadBackup } = useWalletBackup();

  // zkLogin users: wallet backup not available (ephemeral key regenerated on re-auth)
  if (signerType === "zklogin") {
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
          <h3 className={WALLET_STYLES.textBody + " font-medium text-gray-900 dark:text-white"}>Wallet Backup</h3>
        </div>

        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded mb-4">
          <p className={`${WALLET_STYLES.textBody} text-blue-800 dark:text-blue-300 font-medium mb-1`}>
            Not available for zkLogin accounts
          </p>
          <p className={`${WALLET_STYLES.textLabel} text-blue-700 dark:text-blue-400`}>
            Your wallet is linked to your Google account. To create an encrypted backup,
            set up a Smart Account first and use "Full Backup" in the Smart Account menu.
          </p>
        </div>

        <button onClick={onClose} className={`w-full py-2.5 ${WALLET_STYLES.primaryButton}`}>
          Got it
        </button>
      </div>
    );
  }

  const backupSignerType: "passkey" | "local" = signerType === "passkey" ? "passkey" : "local";

  const handleCreateBackup = async (pin: string) => {
    const keypair = signerType === "passkey" ? passkeyKeypair : getKeypair();
    if (!keypair || !address) {
      throw new Error("Cannot access signer key. Please unlock your wallet first.");
    }

    let signerPrivateKey: string | null = null;
    try {
      signerPrivateKey = getSecretKeyFromKeypair(keypair);
      const backup = await createBackup(signerPrivateKey, address, backupSignerType, pin);
      localStorage.setItem("nasun:wallet-backup-created", "true");
      return backup;
    } finally {
      if (signerPrivateKey) secureZeroString(signerPrivateKey);
    }
  };

  const introContent = (
    <div className="space-y-3 mb-4">
      <p className={`${WALLET_STYLES.textBody} text-gray-700 dark:text-zinc-300`}>
        Create an encrypted backup of your wallet signing key.
      </p>

      <div className="p-3 bg-gray-50 dark:bg-zinc-700/50 rounded space-y-2">
        <p className={`${WALLET_STYLES.textLabel} text-gray-700 dark:text-zinc-300 font-medium`}>Included:</p>
        <p className={`${WALLET_STYLES.textLabel} text-gray-600 dark:text-zinc-400`}>
          - Your signing key (encrypted with PIN)
        </p>
        <p className={`${WALLET_STYLES.textLabel} text-gray-600 dark:text-zinc-400`}>
          - Wallet address
        </p>
      </div>

      <div className="p-3 bg-gray-50 dark:bg-zinc-700/50 rounded space-y-2">
        <p className={`${WALLET_STYLES.textLabel} text-gray-700 dark:text-zinc-300 font-medium`}>Not included:</p>
        <p className={`${WALLET_STYLES.textLabel} text-gray-600 dark:text-zinc-400`}>
          - Smart Account settings (guardians, threshold)
        </p>
        <p className={`${WALLET_STYLES.textCaption} text-gray-500 dark:text-zinc-500 mt-1`}>
          Use "Full Backup" in the Smart Account menu for a complete backup.
        </p>
      </div>

      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
        <p className={`${WALLET_STYLES.textLabel} text-amber-800 dark:text-amber-300 font-medium`}>
          If you forget your PIN, the backup cannot be recovered.
        </p>
      </div>
    </div>
  );

  return (
    <BackupWizard
      title="Wallet Backup"
      introContent={introContent}
      onCreateBackup={handleCreateBackup}
      onDownload={(pkg) => downloadBackup(pkg as WalletBackupPackage)}
      onClose={onClose}
    />
  );
}
