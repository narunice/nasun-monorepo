/**
 * RestoreBackupPanel - Unified restore from any backup type.
 *
 * Single entry point: file upload -> auto-detect type -> appropriate restore flow.
 * Supports both Wallet Backup (type: 'wallet') and NSA Backup (legacy v1 / v2).
 *
 * Only accessible from Disconnected state to prevent overwriting existing keys.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  detectBackupType,
  restoreWalletBackup,
  validateWalletBackupFormat,
  validateBackupFormat,
  useNsaBackup,
  secureZeroString,
  recordFailedAttempt,
  resetUnlockAttempts,
  isLockedOut,
  getLockoutRemainingMs,
  BACKUP_RESTORE_ATTEMPT_KEY,
  type WalletBackupPackage,
  type NsaBackupPackage,
} from "@nasun/wallet";
import { WALLET_STYLES } from "../shared";

const MAX_BACKUP_FILE_SIZE = 1_048_576; // 1MB
const MIN_BACKUP_FILE_SIZE = 100; // Valid backups are 400+ bytes

type Step = "upload" | "wallet-pin" | "nsa-pin" | "restoring" | "wallet-success" | "nsa-success";

interface RestoreBackupPanelProps {
  onClose: () => void;
  /** When provided, wallet restore imports key directly to wallet */
  onImportKey?: (privateKey: string) => void;
}

export function RestoreBackupPanel({ onClose, onImportKey }: RestoreBackupPanelProps) {
  const [step, setStep] = useState<Step>("upload");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Raw parsed data before type-specific validation
  const [walletBackup, setWalletBackup] = useState<WalletBackupPackage | null>(null);
  const [nsaBackup, setNsaBackup] = useState<NsaBackupPackage | null>(null);

  // Restore results — H-1 fix: signerPrivateKey is NOT in React state.
  // Only non-sensitive display fields are stored in state.
  const [walletResult, setWalletResult] = useState<{
    signerAddress: string;
    signerType: string;
  } | null>(null);
  const [nsaResult, setNsaResult] = useState<{
    accountObjectId: string;
    signerAddress: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // M-1: Rate limiting state
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // H-1: Private key is stored ONLY in this ref, never in React state
  const resultRef = useRef<{ signerPrivateKey: string } | null>(null);
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { restoreNsaBackup, isProcessing } = useNsaBackup();

  // M-1: Poll lockout status
  useEffect(() => {
    const check = () => {
      if (isLockedOut(BACKUP_RESTORE_ATTEMPT_KEY)) {
        setLockoutRemaining(Math.ceil(getLockoutRemainingMs(BACKUP_RESTORE_ATTEMPT_KEY) / 1000));
      } else {
        setLockoutRemaining(0);
      }
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, []);

  // Secure cleanup on unmount
  useEffect(() => {
    return () => {
      // Best-effort: JS strings are immutable — secureZeroString zeros a
      // buffer copy but the original string persists until GC.
      if (resultRef.current?.signerPrivateKey) {
        secureZeroString(resultRef.current.signerPrivateKey);
      }
      if (clipboardTimerRef.current) {
        clearTimeout(clipboardTimerRef.current);
      }
    };
  }, []);

  const clearResults = useCallback(() => {
    // Best-effort cleanup (L-1: JS string zeroing limitation applies)
    if (resultRef.current?.signerPrivateKey) {
      secureZeroString(resultRef.current.signerPrivateKey);
    }
    setWalletResult(null);
    setNsaResult(null);
    resultRef.current = null;
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    if (file.size > MAX_BACKUP_FILE_SIZE) {
      setError("File too large. Backup files are typically under 1 KB.");
      return;
    }
    // M-3: Minimum file size check
    if (file.size < MIN_BACKUP_FILE_SIZE) {
      setError("File too small to be a valid backup.");
      return;
    }

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      setError("Invalid JSON file");
      return;
    }

    const type = detectBackupType(parsed);
    if (!type) {
      setError("Unrecognized backup format. Please upload a Nasun backup file.");
      return;
    }

    if (type === "wallet") {
      if (!validateWalletBackupFormat(parsed)) {
        setError("Invalid wallet backup format");
        return;
      }
      setWalletBackup(parsed as WalletBackupPackage);
      setStep("wallet-pin");
    } else {
      if (!validateBackupFormat(parsed)) {
        setError("Invalid backup format");
        return;
      }
      setNsaBackup(parsed as NsaBackupPackage);
      setStep("nsa-pin");
    }
  }, []);

  const handleWalletRestore = useCallback(async () => {
    if (!walletBackup || pin.length < 6) return;
    // M-1: Check lockout before attempting
    if (isLockedOut(BACKUP_RESTORE_ATTEMPT_KEY)) {
      const sec = Math.ceil(getLockoutRemainingMs(BACKUP_RESTORE_ATTEMPT_KEY) / 1000);
      setError(`Too many failed attempts. Try again in ${sec} seconds.`);
      return;
    }
    setError(null);
    setStep("restoring");
    try {
      const result = await restoreWalletBackup(walletBackup, pin);
      // H-1: Store private key ONLY in ref, not in React state
      resultRef.current = { signerPrivateKey: result.signerPrivateKey };
      setWalletResult({
        signerAddress: result.signerAddress,
        signerType: result.signerType,
      });
      setPin("");
      resetUnlockAttempts(BACKUP_RESTORE_ATTEMPT_KEY);
      setStep("wallet-success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Restoration failed";
      const isDecryptError = message.includes("Invalid PIN") || message.includes("decrypt");
      if (isDecryptError) {
        recordFailedAttempt(BACKUP_RESTORE_ATTEMPT_KEY);
        if (isLockedOut(BACKUP_RESTORE_ATTEMPT_KEY)) {
          const sec = Math.ceil(getLockoutRemainingMs(BACKUP_RESTORE_ATTEMPT_KEY) / 1000);
          setError(`Too many failed attempts. Try again in ${sec} seconds.`);
        } else {
          setError("Invalid PIN");
        }
      } else {
        setError(message);
      }
      setStep("wallet-pin");
    }
  }, [walletBackup, pin]);

  const handleNsaRestore = useCallback(async () => {
    if (!nsaBackup || pin.length < 6) return;
    // M-1: Check lockout before attempting
    if (isLockedOut(BACKUP_RESTORE_ATTEMPT_KEY)) {
      const sec = Math.ceil(getLockoutRemainingMs(BACKUP_RESTORE_ATTEMPT_KEY) / 1000);
      setError(`Too many failed attempts. Try again in ${sec} seconds.`);
      return;
    }
    setError(null);
    setStep("restoring");
    try {
      const result = await restoreNsaBackup(nsaBackup, pin);
      // H-1: Store private key ONLY in ref, not in React state
      resultRef.current = { signerPrivateKey: result.signerPrivateKey };
      setNsaResult({
        accountObjectId: result.accountObjectId,
        signerAddress: result.signerAddress,
      });
      setPin("");
      resetUnlockAttempts(BACKUP_RESTORE_ATTEMPT_KEY);
      setStep("nsa-success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Restoration failed";
      const isDecryptError = message.includes("Invalid PIN") || message.includes("decrypt");
      if (isDecryptError) {
        recordFailedAttempt(BACKUP_RESTORE_ATTEMPT_KEY);
        if (isLockedOut(BACKUP_RESTORE_ATTEMPT_KEY)) {
          const sec = Math.ceil(getLockoutRemainingMs(BACKUP_RESTORE_ATTEMPT_KEY) / 1000);
          setError(`Too many failed attempts. Try again in ${sec} seconds.`);
        } else {
          setError("Invalid PIN");
        }
      } else {
        setError(message);
      }
      setStep("nsa-pin");
    }
  }, [nsaBackup, pin, restoreNsaBackup]);

  const handleImportKey = useCallback(() => {
    const key = resultRef.current?.signerPrivateKey;
    if (!onImportKey || !key) return;
    onImportKey(key);
    clearResults();
  }, [onImportKey, clearResults]);

  const handleCopyKey = useCallback(async () => {
    const key = resultRef.current?.signerPrivateKey;
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // L-2: Auto-clear clipboard after 30 seconds (without readText permission)
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
      clipboardTimerRef.current = setTimeout(async () => {
        try {
          await navigator.clipboard.writeText("");
          setCopied(false);
        } catch {
          // Expected if page lost focus or permission denied
        }
      }, 30_000);
    } catch {
      setError("Failed to copy. Please select the key manually.");
    }
  }, []);

  // L-2: Explicit clipboard clear button
  const handleClearClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText("");
      setCopied(false);
      if (clipboardTimerRef.current) {
        clearTimeout(clipboardTimerRef.current);
        clipboardTimerRef.current = null;
      }
    } catch {
      // Permission denied — browser prevents clipboard access
    }
  }, []);

  const handleDone = useCallback(() => {
    clearResults();
    onClose();
  }, [clearResults, onClose]);

  // Header component
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

  // === Upload Step ===
  if (step === "upload") {
    return (
      <div className={WALLET_STYLES.panelContainer}>
        <Header onBack={onClose} label="Restore from Backup" />

        <p className={`${WALLET_STYLES.textLabel} text-gray-500 dark:text-zinc-400 mb-4`}>
          Upload your encrypted backup file (.json) to restore your wallet.
        </p>

        <div
          className="border-2 border-dashed border-gray-300 dark:border-zinc-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const file = e.dataTransfer.files[0];
            if (file && (file.type === "application/json" || file.name.endsWith(".json"))) {
              handleFileSelect(file);
            } else {
              setError("Please upload a .json backup file");
            }
          }}
        >
          <svg className="w-8 h-8 mx-auto mb-2 text-gray-400 dark:text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className={`${WALLET_STYLES.textBody} text-gray-600 dark:text-zinc-300`}>
            Click or drag backup file here
          </p>
          <p className={`${WALLET_STYLES.textCaption} text-gray-400 dark:text-zinc-400 mt-1`}>
            Supports Wallet Backup and Smart Account Backup
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
        />

        {error && (
          <p className={`${WALLET_STYLES.textLabel} text-red-400 mt-3 text-center`}>{error}</p>
        )}
      </div>
    );
  }

  // === PIN Entry Step (Wallet or NSA) ===
  if (step === "wallet-pin" || step === "nsa-pin") {
    const isWallet = step === "wallet-pin";
    const handleRestore = isWallet ? handleWalletRestore : handleNsaRestore;
    const isLocked = lockoutRemaining > 0;

    return (
      <div className={WALLET_STYLES.panelContainer}>
        <Header
          onBack={() => {
            setStep("upload");
            setWalletBackup(null);
            setNsaBackup(null);
            setPin("");
            setError(null);
          }}
          label="Enter PIN"
        />

        {/* Backup type indicator */}
        <div className="bg-gray-50 dark:bg-zinc-800 rounded p-3 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-1.5 py-0.5 ${WALLET_STYLES.textCaption} font-medium rounded ${
              isWallet
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
            }`}>
              {isWallet ? "Wallet Backup" : "Smart Account Backup"}
            </span>
          </div>
          {nsaBackup && (
            <>
              <p className={`${WALLET_STYLES.textCaption} text-gray-500 dark:text-zinc-400 mt-1`}>Account</p>
              <p className={`${WALLET_STYLES.textCaption} font-mono text-gray-700 dark:text-zinc-300 break-all`}>
                {nsaBackup.accountObjectId}
              </p>
            </>
          )}
          <p className={`${WALLET_STYLES.textCaption} text-gray-400 dark:text-zinc-400 mt-1`}>
            Created: {new Date((isWallet ? walletBackup : nsaBackup)?.createdAt ?? 0).toLocaleString("en-US")}
          </p>
        </div>

        {/* M-1: Lockout banner */}
        {isLocked && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 mb-3">
            <p className={`${WALLET_STYLES.textLabel} text-red-700 dark:text-red-400 font-medium`}>
              Too many failed attempts
            </p>
            <p className={`${WALLET_STYLES.textCaption} text-red-600 dark:text-red-400`}>
              Try again in {lockoutRemaining}s
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className={`block ${WALLET_STYLES.textLabel} text-gray-500 dark:text-zinc-400 mb-1`}>
              Backup PIN (min 6 characters)
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pin.length >= 6 && !isLocked && handleRestore()}
              placeholder="Enter your backup PIN"
              className={`w-full ${WALLET_STYLES.input}`}
              autoFocus
              disabled={isLocked}
            />
          </div>

          {error && !isLocked && <p className={`${WALLET_STYLES.textLabel} text-red-400`}>{error}</p>}

          <button
            onClick={handleRestore}
            disabled={pin.length < 6 || isProcessing || isLocked}
            className={`w-full py-2.5 ${WALLET_STYLES.primaryButton}`}
          >
            Restore
          </button>
        </div>
      </div>
    );
  }

  // === Restoring Step (spinner) ===
  if (step === "restoring") {
    return (
      <div className={WALLET_STYLES.panelContainer}>
        <div className="flex flex-col items-center py-8">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className={`${WALLET_STYLES.textBody} text-gray-700 dark:text-zinc-300`}>Decrypting backup...</p>
          <p className={`${WALLET_STYLES.textLabel} text-gray-500 dark:text-zinc-400 mt-1`}>This may take a moment</p>
        </div>
      </div>
    );
  }

  // === Wallet Restore Success ===
  if (step === "wallet-success" && walletResult) {
    return (
      <div className={WALLET_STYLES.panelContainer}>
        <div className="flex flex-col items-center py-4">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h3 className={`${WALLET_STYLES.textBody} font-medium text-gray-900 dark:text-white mb-1`}>
            Wallet Restored
          </h3>
          <p className={`${WALLET_STYLES.textLabel} text-gray-500 dark:text-zinc-400 text-center mb-4`}>
            Your wallet signing key has been decrypted successfully.
          </p>

          <div className="w-full bg-gray-50 dark:bg-zinc-800 rounded p-3 mb-4">
            <p className={`${WALLET_STYLES.textCaption} text-gray-500 dark:text-zinc-400 mb-1`}>Address</p>
            <p className={`${WALLET_STYLES.textCaption} font-mono text-gray-700 dark:text-zinc-300 break-all`}>
              {walletResult.signerAddress}
            </p>
          </div>

          <div className="w-full space-y-2">
            {onImportKey ? (
              <button
                onClick={handleImportKey}
                className={`w-full py-2.5 ${WALLET_STYLES.primaryButton} flex items-center justify-center gap-2`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import to Wallet
              </button>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded p-3">
                <p className={`${WALLET_STYLES.textCaption} text-yellow-700 dark:text-yellow-400`}>
                  Close this panel and use "Import" to restore your wallet with the key.
                </p>
              </div>
            )}
            <p className={`${WALLET_STYLES.textCaption} text-gray-400 dark:text-zinc-400 text-center`}>
              If you had a Smart Account, reconnect it from the Account tab.
            </p>
            <button onClick={handleDone} className={`w-full py-2 ${WALLET_STYLES.secondaryButton}`}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === NSA Restore Success ===
  if (step === "nsa-success" && nsaResult) {
    const maskedKey = resultRef.current?.signerPrivateKey
      ? `${resultRef.current.signerPrivateKey.slice(0, 12)}${"*".repeat(8)}...`
      : "***";

    return (
      <div className={WALLET_STYLES.panelContainer}>
        <div className="flex flex-col items-center py-4">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h3 className={`${WALLET_STYLES.textBody} font-medium text-gray-900 dark:text-white mb-1`}>
            Smart Account Restored
          </h3>
          <p className={`${WALLET_STYLES.textLabel} text-gray-500 dark:text-zinc-400 text-center mb-4`}>
            Your SmartAccount signer key has been decrypted.
          </p>

          <div className="w-full space-y-3 mb-4">
            <div className="bg-gray-50 dark:bg-zinc-800 rounded p-3">
              <p className={`${WALLET_STYLES.textCaption} text-gray-500 dark:text-zinc-400 mb-1`}>Account</p>
              <p className={`${WALLET_STYLES.textCaption} font-mono text-gray-700 dark:text-zinc-300 break-all`}>
                {nsaResult.accountObjectId}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-zinc-800 rounded p-3">
              <p className={`${WALLET_STYLES.textCaption} text-gray-500 dark:text-zinc-400 mb-1`}>Signer</p>
              <p className={`${WALLET_STYLES.textCaption} font-mono text-gray-700 dark:text-zinc-300 break-all`}>
                {nsaResult.signerAddress}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-zinc-800 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <p className={`${WALLET_STYLES.textCaption} text-gray-500 dark:text-zinc-400`}>Private Key</p>
                <div className="flex items-center gap-2">
                  <button onClick={handleCopyKey} className={`${WALLET_STYLES.textCaption} text-blue-500 hover:text-blue-600 transition-colors`}>
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  {copied && (
                    <button
                      onClick={handleClearClipboard}
                      className={`${WALLET_STYLES.textCaption} text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors`}
                    >
                      Clear Clipboard
                    </button>
                  )}
                </div>
              </div>
              <p className={`${WALLET_STYLES.textCaption} font-mono text-gray-700 dark:text-zinc-300 break-all`}>
                {maskedKey}
              </p>
            </div>
          </div>

          {error && <p className={`${WALLET_STYLES.textLabel} text-red-400 mb-2 text-center`}>{error}</p>}

          <div className="w-full space-y-2">
            {onImportKey ? (
              <button
                onClick={handleImportKey}
                className={`w-full py-2.5 ${WALLET_STYLES.primaryButton} flex items-center justify-center gap-2`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import to Wallet
              </button>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded p-3">
                <p className={`${WALLET_STYLES.textCaption} text-yellow-700 dark:text-yellow-400`}>
                  Copy this key and import it via Import Wallet to sign transactions.
                </p>
              </div>
            )}
            <button onClick={handleDone} className={`w-full py-2 ${WALLET_STYLES.secondaryButton}`}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
