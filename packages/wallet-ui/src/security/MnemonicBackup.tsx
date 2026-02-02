/**
 * Nasun Wallet Mnemonic Backup Component
 * Mnemonic backup screen - shown once after wallet creation
 */

import { useState, useCallback } from 'react';

interface MnemonicBackupProps {
  mnemonic: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export function MnemonicBackup({ mnemonic, onConfirm, onCancel }: MnemonicBackupProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const words = mnemonic.split(' ');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 5000);
    } catch {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 5000);
    }
  }, [mnemonic]);

  return (
    <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
      <h3 className="text-base md:text-lg xl:text-xl font-bold text-blue-600 dark:text-blue-400 mb-4 flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Backup Your Recovery Phrase
      </h3>

      <p className="text-sm md:text-base text-gray-500 dark:text-zinc-400 mb-4">
        Write down these 12 words in order. This is the <strong className="text-gray-900 dark:text-white">ONLY way</strong> to recover
        your wallet if you lose access.
      </p>

      {/* Mnemonic word grid */}
      <div className="grid grid-cols-3 gap-2 mb-4 p-4 bg-gray-50 dark:bg-zinc-900 rounded border border-gray-200 dark:border-zinc-700">
        {words.map((word, i) => (
          <div key={i} className="flex items-center gap-2 text-sm xl:text-base py-1">
            <span className="text-gray-400 dark:text-zinc-500 w-5 text-right">{i + 1}.</span>
            <span className="text-gray-900 dark:text-white font-mono">{word}</span>
          </div>
        ))}
      </div>

      {/* Copy button */}
      <button
        onClick={handleCopy}
        className={`w-full mb-2 px-3 py-2 text-sm xl:text-base rounded transition-colors flex items-center justify-center gap-2 ${
          copied
            ? 'bg-green-500/20 text-green-600 dark:text-green-400'
            : copyError
            ? 'bg-red-500/20 text-red-600 dark:text-red-400'
            : 'bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-900 dark:text-white'
        }`}
      >
        {copied ? (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Copied to clipboard
          </>
        ) : copyError ? (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Copy failed - select and copy manually
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy to clipboard
          </>
        )}
      </button>

      {copyError && (
        <p className="text-xs xl:text-sm text-center text-gray-500 dark:text-zinc-400 mb-4">
          Select the words above and use Ctrl+C (or Cmd+C) to copy
        </p>
      )}
      {!copyError && <div className="mb-2" />}

      {/* Warning messages */}
      <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-500/50 rounded p-3 mb-4">
        <ul className="text-xs xl:text-sm text-red-700 dark:text-red-400 space-y-1">
          <li className="flex items-start gap-2">
            <span className="text-red-600 dark:text-red-500 mt-0.5">!</span>
            <span>Never share your recovery phrase with anyone</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 dark:text-red-500 mt-0.5">!</span>
            <span>Store it securely offline (paper, metal backup)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-red-600 dark:text-red-500 mt-0.5">!</span>
            <span>This phrase will NOT be shown again</span>
          </li>
        </ul>
      </div>

      {/* Confirmation checkbox */}
      <label className="flex items-start gap-3 mb-4 cursor-pointer group">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="w-4 h-4 mt-0.5 rounded border-gray-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-zinc-800"
        />
        <span className="text-sm xl:text-base text-gray-600 dark:text-zinc-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
          I have saved my recovery phrase securely and understand that losing it means losing access to my wallet forever
        </span>
      </label>

      {/* Buttons */}
      <div className="flex gap-2">
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-1 py-2 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-900 dark:text-white font-medium rounded transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={onConfirm}
          disabled={!confirmed}
          className="flex-1 py-2 bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded transition-colors hover:bg-blue-700 disabled:cursor-not-allowed"
        >
          I've Saved It
        </button>
      </div>
    </div>
  );
}
