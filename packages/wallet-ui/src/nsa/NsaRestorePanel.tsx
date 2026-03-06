/**
 * NsaRestorePanel - Tier 2 Encrypted Backup Restore
 *
 * Restores a SmartAccount signer from an encrypted backup JSON file.
 * Does NOT require an existing wallet connection.
 * Steps: upload -> pin -> restoring -> success
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useNsaBackup, secureZeroString } from "@nasun/wallet";
import type { NsaBackupPackage } from "@nasun/wallet";

type Step = "upload" | "pin" | "restoring" | "success";

const MAX_BACKUP_FILE_SIZE = 1_048_576; // 1 MB
const CLIPBOARD_CLEAR_MS = 30_000; // 30 seconds

interface RestoredData {
  signerPrivateKey: string;
  accountObjectId: string;
  signerAddress: string;
}

export interface NsaRestorePanelProps {
  onClose: () => void;
  /** When provided, shows "Import to Wallet" button on success */
  onImportKey?: (privateKey: string) => void;
}

export function NsaRestorePanel({ onClose, onImportKey }: NsaRestorePanelProps) {
  const [step, setStep] = useState<Step>("upload");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<NsaBackupPackage | null>(null);
  const [restoredData, setRestoredData] = useState<RestoredData | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ref to track latest restoredData for cleanup (avoids stale closure)
  const restoredDataRef = useRef<RestoredData | null>(null);
  useEffect(() => {
    restoredDataRef.current = restoredData;
  }, [restoredData]);

  const { parseBackupFile, restoreNsaBackup, isProcessing } = useNsaBackup();

  // Secure cleanup on unmount — uses ref to avoid stale closure
  useEffect(() => {
    return () => {
      if (restoredDataRef.current?.signerPrivateKey) {
        secureZeroString(restoredDataRef.current.signerPrivateKey);
      }
    };
  }, []);

  // Securely clear restoredData state and zero the key
  const clearRestoredData = useCallback(() => {
    if (restoredDataRef.current?.signerPrivateKey) {
      secureZeroString(restoredDataRef.current.signerPrivateKey);
    }
    setRestoredData(null);
    restoredDataRef.current = null;
  }, []);

  const handleFileSelect = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_BACKUP_FILE_SIZE) {
        setError("File too large. Backup files are typically under 1 KB.");
        return;
      }
      try {
        const parsed = await parseBackupFile(file);
        setBackup(parsed);
        setStep("pin");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid backup file");
      }
    },
    [parseBackupFile],
  );

  const handleRestore = useCallback(async () => {
    if (!backup || pin.length < 6) return;
    setError(null);
    setStep("restoring");
    try {
      const result = await restoreNsaBackup(backup, pin);
      setRestoredData(result);
      setPin(""); // Clear PIN from memory after use
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restoration failed");
      setStep("pin");
    }
  }, [backup, pin, restoreNsaBackup]);

  const handleCopyKey = useCallback(async () => {
    if (!restoredData?.signerPrivateKey) return;
    try {
      await navigator.clipboard.writeText(restoredData.signerPrivateKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Auto-clear clipboard after 30 seconds
      const keyCopy = restoredData.signerPrivateKey;
      setTimeout(async () => {
        try {
          const current = await navigator.clipboard.readText();
          if (current === keyCopy) {
            await navigator.clipboard.writeText("");
          }
        } catch {
          // Permission denied is expected in some browsers
        }
      }, CLIPBOARD_CLEAR_MS);
    } catch {
      setError("Failed to copy. Please select the key manually.");
    }
  }, [restoredData]);

  const handleImportKey = useCallback(() => {
    if (!onImportKey || !restoredData?.signerPrivateKey) return;
    const key = restoredData.signerPrivateKey;
    clearRestoredData();
    onImportKey(key);
  }, [onImportKey, restoredData, clearRestoredData]);

  const handleDone = useCallback(() => {
    clearRestoredData();
    onClose();
  }, [clearRestoredData, onClose]);

  // Upload step
  if (step === "upload") {
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
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
            Restore from Backup
          </h3>
        </div>

        <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-4">
          Upload your encrypted backup file (.json) to restore your SmartAccount.
        </p>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-gray-300 dark:border-zinc-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
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
          <svg
            className="w-8 h-8 mx-auto mb-2 text-gray-400 dark:text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-sm text-gray-600 dark:text-zinc-300">
            Click or drag backup file here
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-400 mt-1">
            nasun-backup-*.json
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
          <p className="text-xs xl:text-sm text-red-400 mt-3 text-center">{error}</p>
        )}
      </div>
    );
  }

  // PIN step
  if (step === "pin") {
    return (
      <div className="p-4 w-full">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => {
              setStep("upload");
              setBackup(null);
              setPin("");
              setError(null);
            }}
            className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white">
            Enter PIN
          </h3>
        </div>

        {backup && (
          <div className="bg-gray-50 dark:bg-zinc-800 rounded p-3 mb-4">
            <p className="text-xs text-gray-500 dark:text-zinc-400">Account</p>
            <p className="text-xs font-mono text-gray-700 dark:text-zinc-300 break-all">
              {backup.accountObjectId}
            </p>
            <p className="text-xs text-gray-400 dark:text-zinc-400 mt-1">
              Created: {new Date(backup.createdAt).toLocaleString("en-US")}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-1">
              Backup PIN (min 6 characters)
            </label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pin.length >= 6 && handleRestore()}
              placeholder="Enter your backup PIN"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-400 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm xl:text-base"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs xl:text-sm text-red-400">{error}</p>
          )}

          <button
            onClick={handleRestore}
            disabled={pin.length < 6 || isProcessing}
            className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded text-sm xl:text-base transition-colors"
          >
            Restore
          </button>
        </div>
      </div>
    );
  }

  // Restoring step
  if (step === "restoring") {
    return (
      <div className="p-4 w-full">
        <div className="flex flex-col items-center py-8">
          <div className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm xl:text-base text-gray-700 dark:text-zinc-300">Decrypting backup...</p>
          <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mt-1">
            This may take a moment
          </p>
        </div>
      </div>
    );
  }

  // Success step
  return (
    <div className="p-4 w-full">
      <div className="flex flex-col items-center py-4">
        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6 text-green-600 dark:text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h3 className="text-sm xl:text-base font-medium text-gray-900 dark:text-white mb-1">
          Backup Restored
        </h3>
        <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 text-center mb-4">
          Your SmartAccount signer key has been decrypted successfully.
        </p>

        {restoredData && (
          <div className="w-full space-y-3 mb-4">
            <div className="bg-gray-50 dark:bg-zinc-800 rounded p-3">
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">Account</p>
              <p className="text-xs font-mono text-gray-700 dark:text-zinc-300 break-all">
                {restoredData.accountObjectId}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-zinc-800 rounded p-3">
              <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1">Signer Address</p>
              <p className="text-xs font-mono text-gray-700 dark:text-zinc-300 break-all">
                {restoredData.signerAddress}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-zinc-800 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500 dark:text-zinc-400">Private Key</p>
                <button
                  onClick={handleCopyKey}
                  className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-xs font-mono text-gray-700 dark:text-zinc-300 break-all">
                {restoredData.signerPrivateKey.slice(0, 12)}{"*".repeat(8)}...
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs xl:text-sm text-red-400 mb-2 text-center">{error}</p>
        )}

        <div className="w-full space-y-2">
          {onImportKey && restoredData ? (
            <button
              onClick={handleImportKey}
              className="w-full px-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm xl:text-base transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Import to Wallet
            </button>
          ) : (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded p-3">
              <p className="text-xs text-yellow-700 dark:text-yellow-400">
                Copy this key and import it via Import Wallet to sign transactions.
              </p>
            </div>
          )}
          <button
            onClick={handleDone}
            className="w-full px-3 py-2 text-sm xl:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
