/**
 * BackupWizard - Shared PIN entry + backup creation wizard.
 *
 * Provides the common flow: intro → set-pin → confirm-pin → creating → download
 * Used by both WalletBackupPanel and NsaBackupPanel.
 */

import { useState, type ReactNode } from "react";
import { WALLET_STYLES } from "../shared";

type Step = "intro" | "set-pin" | "confirm-pin" | "creating" | "download";

interface BackupWizardProps {
  title: string;
  /** Content shown in the intro step (what's included, warnings, etc.) */
  introContent: ReactNode;
  /** Called with the confirmed PIN to create the backup */
  onCreateBackup: (pin: string) => Promise<object>;
  /** Called to download the created backup */
  onDownload: (pkg: object) => void;
  onClose: () => void;
}

export function BackupWizard({
  title,
  introContent,
  onCreateBackup,
  onDownload,
  onClose,
}: BackupWizardProps) {
  const [step, setStep] = useState<Step>("intro");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [backupData, setBackupData] = useState<object | null>(null);
  const [hasDownloaded, setHasDownloaded] = useState(false);

  const handleCreateBackup = async () => {
    setStep("creating");
    setError(null);
    try {
      const backup = await onCreateBackup(pin);
      setBackupData(backup);
      setPin("");
      setConfirmPin("");
      setStep("download");
    } catch (err) {
      setPin("");
      setConfirmPin("");
      setError(err instanceof Error ? err.message : "Failed to create backup");
      setStep("set-pin");
    }
  };

  const handleDownload = () => {
    if (backupData) {
      onDownload(backupData);
      setHasDownloaded(true);
    }
  };

  // Header with back button
  const Header = ({ onBack, label }: { onBack: () => void; label: string }) => (
    <div className="flex items-center gap-2 mb-4">
      <button
        onClick={onBack}
        className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h3 className={WALLET_STYLES.textBody + " font-medium text-gray-900 dark:text-white"}>{label}</h3>
    </div>
  );

  // Intro step
  if (step === "intro") {
    return (
      <div className={WALLET_STYLES.panelContainer}>
        <Header onBack={onClose} label={title} />
        {introContent}
        <button
          onClick={() => setStep("set-pin")}
          className={`w-full py-2.5 ${WALLET_STYLES.primaryButton}`}
        >
          Create Backup
        </button>
      </div>
    );
  }

  // Set PIN step
  if (step === "set-pin") {
    return (
      <div className={WALLET_STYLES.panelContainer}>
        <Header onBack={() => setStep("intro")} label="Set Backup PIN" />
        <div className="space-y-3">
          <div>
            <label className={`${WALLET_STYLES.textLabel} text-gray-500 dark:text-zinc-400 mb-1 block`}>
              PIN (6+ characters)
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter a secure PIN"
              className={`w-full ${WALLET_STYLES.input}`}
              autoFocus
            />
            {pin.length > 0 && pin.length < 6 && (
              <p className={`${WALLET_STYLES.textLabel} text-red-400 mt-1`}>
                PIN must be at least 6 characters
              </p>
            )}
          </div>
          {error && <p className={`${WALLET_STYLES.textLabel} text-red-500`}>{error}</p>}
          <button
            onClick={() => { setError(null); setStep("confirm-pin"); }}
            disabled={pin.length < 6}
            className={`w-full py-2.5 ${WALLET_STYLES.primaryButton}`}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Confirm PIN step
  if (step === "confirm-pin") {
    const pinsMatch = confirmPin === pin;
    return (
      <div className={WALLET_STYLES.panelContainer}>
        <Header onBack={() => { setConfirmPin(""); setStep("set-pin"); }} label="Confirm PIN" />
        <div className="space-y-3">
          <div>
            <label className={`${WALLET_STYLES.textLabel} text-gray-500 dark:text-zinc-400 mb-1 block`}>
              Re-enter PIN
            </label>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="Confirm your PIN"
              onKeyDown={(e) => e.key === "Enter" && pinsMatch && handleCreateBackup()}
              className={`w-full ${WALLET_STYLES.input}`}
              autoFocus
            />
            {confirmPin.length > 0 && !pinsMatch && (
              <p className={`${WALLET_STYLES.textLabel} text-red-400 mt-1`}>PINs do not match</p>
            )}
          </div>
          <button
            onClick={handleCreateBackup}
            disabled={!pinsMatch}
            className={`w-full py-2.5 ${WALLET_STYLES.primaryButton}`}
          >
            Create Backup
          </button>
        </div>
      </div>
    );
  }

  // Creating step (spinner)
  if (step === "creating") {
    return (
      <div className={WALLET_STYLES.panelContainer}>
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className={`${WALLET_STYLES.textBody} text-gray-700 dark:text-zinc-300`}>
            Encrypting backup...
          </p>
          <p className={`${WALLET_STYLES.textLabel} text-gray-500 dark:text-zinc-400 mt-1`}>
            This may take a moment
          </p>
        </div>
      </div>
    );
  }

  // Download step
  return (
    <div className={WALLET_STYLES.panelContainer}>
      <div className="flex flex-col items-center py-6">
        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className={`${WALLET_STYLES.textBody} font-medium text-gray-900 dark:text-white mb-1`}>
          Backup Created
        </h3>
        <p className={`${WALLET_STYLES.textLabel} text-gray-500 dark:text-zinc-400 text-center mb-4`}>
          Store this file in a secure location. You will need your PIN to restore.
        </p>
        <div className="w-full space-y-2">
          <button
            onClick={handleDownload}
            className={`w-full py-2.5 ${WALLET_STYLES.primaryButton} flex items-center justify-center gap-2`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {hasDownloaded ? "Download Again" : "Download Backup"}
          </button>
          <button onClick={onClose} className={`w-full py-2 ${WALLET_STYLES.secondaryButton}`}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
