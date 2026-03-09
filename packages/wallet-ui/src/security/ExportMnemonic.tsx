/**
 * Nasun Wallet Export Mnemonic Component
 * View recovery phrase (requires password verification)
 */

import { useState, useCallback, useEffect, useRef } from 'react';

interface ExportMnemonicProps {
  onExport: (password: string) => Promise<string | null>;
  onClose: () => void;
  /** Whether this wallet was imported from a private key (affects "not available" message) */
  isPrivateKeyImport?: boolean;
  /** Authentication mode: "password" (default) or "biometric" (passkey wallets) */
  authMode?: "password" | "biometric";
}

export function ExportMnemonic({ onExport, onClose, isPrivateKeyImport = false, authMode = "password" }: ExportMnemonicProps) {
  const [password, setPassword] = useState('');
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [showWords, setShowWords] = useState(false);
  const [notAvailable, setNotAvailable] = useState(false);
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount: clear mnemonic from state and clipboard
  useEffect(() => {
    return () => {
      setMnemonic(null);
      if (clipboardTimerRef.current) {
        clearTimeout(clipboardTimerRef.current);
      }
      navigator.clipboard.writeText('').catch(() => {});
    };
  }, []);

  const handleExport = useCallback(async () => {
    if (authMode === "password" && !password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await onExport(authMode === "biometric" ? "" : password);
      if (result === null) {
        setNotAvailable(true);
      } else {
        setMnemonic(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export recovery phrase');
    } finally {
      setIsLoading(false);
    }
  }, [authMode, password, onExport]);

  const handleCopy = useCallback(async () => {
    if (!mnemonic) return;

    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setCopyError(false);
      // Clear clipboard after 30 seconds for security
      clipboardTimerRef.current = setTimeout(async () => {
        try { await navigator.clipboard.writeText(''); } catch { /* best-effort */ }
        setCopied(false);
      }, 30000);
    } catch {
      // Fallback for older browsers or non-secure contexts
      try {
        const textarea = document.createElement('textarea');
        textarea.value = mnemonic;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setCopyError(false);
        clipboardTimerRef.current = setTimeout(async () => {
          try { await navigator.clipboard.writeText(''); } catch { /* best-effort */ }
          setCopied(false);
        }, 30000);
      } catch {
        setCopyError(true);
        setShowWords(true);
        setTimeout(() => setCopyError(false), 5000);
      }
    }
  }, [mnemonic]);

  const handleClose = useCallback(() => {
    setMnemonic(null);
    setPassword('');
    if (clipboardTimerRef.current) {
      clearTimeout(clipboardTimerRef.current);
    }
    navigator.clipboard.writeText('').catch(() => {});
    onClose();
  }, [onClose]);

  // Priority: mnemonic display and not-available must precede the biometric prompt.
  // Without this ordering, a successful biometric auth would re-render into the
  // biometric screen again (unconditional early return) and never show the mnemonic.

  // Biometric verification screen (passkey wallets) — shown only when mnemonic not yet revealed
  if (authMode === "biometric" && !mnemonic && !notAvailable) {
    return (
      <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
        <h3 className="text-lg xl:text-xl font-bold text-gray-900 dark:text-white mb-4">View Recovery Phrase</h3>

        {/* Warning */}
        <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-500/50 rounded p-3 mb-4">
          <p className="text-xs xl:text-sm text-yellow-700 dark:text-yellow-400">
            Warning: Your recovery phrase grants full access to your wallet. Make sure no one is watching your screen.
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-sm md:text-base text-gray-500 dark:text-zinc-400">
            Authenticate with biometrics to view your recovery phrase.
          </p>

          {error && (
            <p className="text-sm xl:text-base text-red-400">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleClose}
              disabled={isLoading}
              className="flex-1 py-2 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                'Verifying...'
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                  </svg>
                  Verify with Biometrics
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Mnemonic not available state
  if (notAvailable) {
    return (
      <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
        <h3 className="text-base md:text-lg xl:text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Recovery Phrase Not Available
        </h3>

        <div className="bg-gray-50 dark:bg-zinc-700/50 border border-gray-200 dark:border-zinc-600 rounded p-3 mb-4">
          <p className="text-sm xl:text-base text-gray-600 dark:text-zinc-300">
            {isPrivateKeyImport
              ? 'This wallet was imported from a private key. No recovery phrase exists for this wallet.'
              : 'Recovery phrase was not saved during wallet creation. If you backed up your 12 words previously, they remain valid.'}
          </p>
        </div>

        <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400 mb-4">
          You can still use <strong>Export Private Key</strong> or <strong>Wallet Backup</strong> to secure your wallet.
        </p>

        <button
          onClick={onClose}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  // Mnemonic displayed state
  if (mnemonic) {
    const words = mnemonic.split(' ');

    return (
      <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
        <h3 className="text-base md:text-lg xl:text-xl font-bold text-amber-600 dark:text-amber-400 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Your Recovery Phrase
        </h3>

        {/* Warning messages */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-500/40 rounded p-3 mb-4">
          <ul className="text-xs xl:text-sm text-amber-700 dark:text-amber-300 space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-amber-600 dark:text-amber-400 mt-0.5">!</span>
              <span>Anyone with these words can access your funds</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600 dark:text-amber-400 mt-0.5">!</span>
              <span>Never share your recovery phrase with anyone</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600 dark:text-amber-400 mt-0.5">!</span>
              <span>Make sure no one is watching your screen</span>
            </li>
          </ul>
        </div>

        {/* Mnemonic word grid */}
        <div className="relative mb-4">
          <div className="grid grid-cols-3 gap-2 p-4 bg-gray-50 dark:bg-zinc-900 rounded border border-gray-200 dark:border-zinc-700">
            {words.map((word, i) => (
              <div key={i} className="flex items-center gap-2 text-sm xl:text-base py-1">
                <span className="text-gray-400 dark:text-zinc-400 w-5 text-right">{i + 1}.</span>
                {showWords ? (
                  <span className="text-gray-900 dark:text-white font-mono">{word}</span>
                ) : (
                  <span className="text-gray-400 dark:text-zinc-400 font-mono">{'••••'}</span>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowWords(!showWords)}
            className="absolute top-2 right-2 p-1.5 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 rounded transition-colors"
            aria-label={showWords ? 'Hide recovery phrase' : 'Show recovery phrase'}
            title={showWords ? 'Hide' : 'Show'}
          >
            {showWords ? (
              <svg className="w-4 h-4 text-gray-700 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-gray-700 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>

        {/* Copy error message */}
        {copyError && (
          <p className="text-xs xl:text-sm text-center text-red-500 dark:text-red-400 mb-2">
            Copy failed. Select the words above and use Ctrl+C (or Cmd+C)
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className={`flex-1 py-2 flex items-center justify-center gap-2 rounded transition-colors ${
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
                Copied
              </>
            ) : copyError ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Copy failed
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </>
            )}
          </button>
          <button
            onClick={handleClose}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // Password input screen
  return (
    <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
      <h3 className="text-lg xl:text-xl font-bold text-gray-900 dark:text-white mb-4">View Recovery Phrase</h3>

      {/* Warning */}
      <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-500/50 rounded p-3 mb-4">
        <p className="text-xs xl:text-sm text-yellow-700 dark:text-yellow-400">
          Warning: Your recovery phrase grants full access to your wallet. Make sure no one is watching your screen.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm md:text-base text-gray-500 dark:text-zinc-400 mb-2">
            Enter your password to continue
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your wallet password"
            className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            disabled={isLoading}
            onKeyDown={(e) => e.key === 'Enter' && handleExport()}
          />
        </div>

        {error && (
          <p className="text-sm xl:text-base text-red-400">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1 py-2 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isLoading || (authMode !== "biometric" && !password)}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded transition-colors"
          >
            {isLoading ? 'Verifying...' : 'View Phrase'}
          </button>
        </div>
      </div>
    </div>
  );
}
