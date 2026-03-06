/**
 * Nasun Wallet Export Private Key Component
 * Export private key (requires password verification)
 */

import { useState, useCallback } from 'react';

interface ExportPrivateKeyProps {
  onExport: (password: string) => Promise<string>;
  onClose: () => void;
  /** Authentication mode: "password" (default) or "biometric" (passkey wallets) */
  authMode?: "password" | "biometric";
}

export function ExportPrivateKey({ onExport, onClose, authMode = "password" }: ExportPrivateKeyProps) {
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const handleExport = useCallback(async () => {
    if (authMode === "password" && !password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const key = await onExport(authMode === "biometric" ? "" : password);
      setPrivateKey(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export private key');
    } finally {
      setIsLoading(false);
    }
  }, [password, onExport, authMode]);

  const handleCopy = useCallback(async () => {
    if (!privateKey) return;

    try {
      await navigator.clipboard.writeText(privateKey);
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 5000);
    }
  }, [privateKey]);

  const handleClose = useCallback(() => {
    // Clear sensitive info
    setPrivateKey(null);
    setPassword('');
    onClose();
  }, [onClose]);

  // Private key displayed state
  if (privateKey) {
    return (
      <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
        <h3 className="text-base md:text-lg xl:text-xl font-bold text-amber-600 dark:text-amber-400 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Your Private Key
        </h3>

        {/* Warning messages */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-500/40 rounded p-3 mb-4">
          <ul className="text-xs xl:text-sm text-amber-700 dark:text-amber-300 space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-amber-600 dark:text-amber-400 mt-0.5">!</span>
              <span>Anyone with this key can access your funds</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600 dark:text-amber-400 mt-0.5">!</span>
              <span>Never share this key with anyone</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600 dark:text-amber-400 mt-0.5">!</span>
              <span>Store it in a secure location</span>
            </li>
          </ul>
        </div>

        {/* Private key display */}
        <div className="mb-4">
          <div className="relative">
            <div className="p-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded font-mono text-sm xl:text-base break-all">
              {showKey ? (
                <span className="text-gray-900 dark:text-white">{privateKey}</span>
              ) : (
                <span className="text-gray-400 dark:text-zinc-400">{'•'.repeat(64)}</span>
              )}
            </div>
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute top-2 right-2 p-1.5 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 rounded transition-colors"
              title={showKey ? 'Hide' : 'Show'}
            >
              {showKey ? (
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
        </div>

        {/* Copy error message */}
        {copyError && (
          <p className="text-xs xl:text-sm text-center text-red-500 dark:text-red-400 mb-2">
            Copy failed. Select the key above and use Ctrl+C (or Cmd+C)
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

  // Biometric verification screen (passkey wallets)
  if (authMode === "biometric") {
    return (
      <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
        <h3 className="text-lg xl:text-xl font-bold text-gray-900 dark:text-white mb-4">Export Private Key</h3>

        {/* Warning */}
        <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-500/50 rounded p-3 mb-4">
          <p className="text-xs xl:text-sm text-yellow-700 dark:text-yellow-400">
            Warning: Your private key grants full access to your wallet. Make sure no one is watching your screen.
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-sm md:text-base text-gray-500 dark:text-zinc-400">
            Verify your identity with biometrics to export your private key.
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

  // Password input screen (self-custody wallets)
  return (
    <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
      <h3 className="text-lg xl:text-xl font-bold text-gray-900 dark:text-white mb-4">Export Private Key</h3>

      {/* Warning */}
      <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-500/50 rounded p-3 mb-4">
        <p className="text-xs xl:text-sm text-yellow-700 dark:text-yellow-400">
          Warning: Your private key grants full access to your wallet. Make sure no one is watching your screen.
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
            disabled={isLoading || !password}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded transition-colors"
          >
            {isLoading ? 'Verifying...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
