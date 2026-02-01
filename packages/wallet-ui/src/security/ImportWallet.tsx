/**
 * Nasun Wallet Import Component
 * Import wallet from mnemonic or private key
 */

import { useState, useCallback } from 'react';

type ImportMode = 'select' | 'mnemonic' | 'privatekey';

interface ImportWalletProps {
  onImportMnemonic: (mnemonic: string, password: string) => Promise<void>;
  onImportPrivateKey: (privateKey: string, password: string) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ImportWallet({
  onImportMnemonic,
  onImportPrivateKey,
  onCancel,
  isLoading = false,
}: ImportWalletProps) {
  const [mode, setMode] = useState<ImportMode>('select');
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleImportMnemonic = useCallback(async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const words = mnemonic.trim().toLowerCase().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setError('Recovery phrase must be 12 or 24 words');
      return;
    }

    setError(null);
    try {
      await onImportMnemonic(mnemonic.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import wallet');
    }
  }, [mnemonic, password, confirmPassword, onImportMnemonic]);

  const handleImportPrivateKey = useCallback(async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const key = privateKey.trim();
    if (!key.startsWith('suiprivkey1')) {
      setError('Private key must start with "suiprivkey1"');
      return;
    }

    setError(null);
    try {
      await onImportPrivateKey(key, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import wallet');
    }
  }, [privateKey, password, confirmPassword, onImportPrivateKey]);

  // Import method selection screen
  if (mode === 'select') {
    return (
      <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
        <h3 className="text-lg xl:text-xl font-bold text-gray-900 dark:text-white mb-4">Import Wallet</h3>
        <p className="text-sm md:text-base text-gray-500 dark:text-zinc-400 mb-4">
          Choose how to import your existing wallet
        </p>

        <div className="space-y-3 mb-4">
          <button
            onClick={() => setMode('mnemonic')}
            className="w-full p-4 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 rounded-lg text-left transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 dark:bg-zinc-600 group-hover:bg-gray-300 dark:group-hover:bg-zinc-500 rounded-lg flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-gray-700 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-white">Recovery Phrase</div>
                <div className="text-xs md:text-sm xl:text-base text-gray-500 dark:text-zinc-400">Import using 12 or 24 word mnemonic</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => setMode('privatekey')}
            className="w-full p-4 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 rounded-lg text-left transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 dark:bg-zinc-600 group-hover:bg-gray-300 dark:group-hover:bg-zinc-500 rounded-lg flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-gray-700 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <div className="font-medium text-gray-900 dark:text-white">Private Key</div>
                <div className="text-xs md:text-sm xl:text-base text-gray-500 dark:text-zinc-400">Import using Bech32 private key (suiprivkey1...)</div>
              </div>
            </div>
          </button>
        </div>

        <button
          onClick={onCancel}
          className="w-full py-2 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Mnemonic input screen
  if (mode === 'mnemonic') {
    return (
      <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
        <button
          onClick={() => setMode('select')}
          className="flex items-center gap-1 text-sm md:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <h3 className="text-lg xl:text-xl font-bold text-gray-900 dark:text-white mb-4">Import with Recovery Phrase</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm md:text-base text-gray-500 dark:text-zinc-400 mb-2">
              Recovery Phrase (12 or 24 words)
            </label>
            <textarea
              value={mnemonic}
              onChange={(e) => setMnemonic(e.target.value)}
              placeholder="Enter your recovery phrase, separated by spaces..."
              rows={3}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm xl:text-base resize-none"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm md:text-base text-gray-500 dark:text-zinc-400 mb-2">
              New Password (min 8 characters)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="block text-sm md:text-base text-gray-500 dark:text-zinc-400 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImportMnemonic()}
              placeholder="Confirm password"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={isLoading}
            />
          </div>

          {/* Real-time password validation */}
          {password.length > 0 && password.length < 8 && (
            <p className="text-xs xl:text-sm text-red-400">Password must be at least 8 characters</p>
          )}
          {confirmPassword.length > 0 && password !== confirmPassword && (
            <p className="text-xs xl:text-sm text-red-400">Passwords do not match</p>
          )}

          {error && (
            <p className="text-sm xl:text-base text-red-400">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1 py-2 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleImportMnemonic}
              disabled={isLoading || !mnemonic.trim() || password.length < 8 || password !== confirmPassword}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded transition-colors"
            >
              {isLoading ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Private key input screen
  return (
    <div className="p-4 bg-white dark:bg-zinc-800 rounded-lg">
      <button
        onClick={() => setMode('select')}
        className="flex items-center gap-1 text-sm md:text-base text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <h3 className="text-lg xl:text-xl font-bold text-gray-900 dark:text-white mb-4">Import with Private Key</h3>

      {/* Warning */}
      <div className="bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-500/50 rounded p-3 mb-4">
        <p className="text-xs xl:text-sm text-yellow-700 dark:text-yellow-400">
          Never share your private key with anyone. Make sure you are on the correct website.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm md:text-base text-gray-500 dark:text-zinc-400 mb-2">
            Private Key (Bech32 format)
          </label>
          <input
            type="password"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            placeholder="suiprivkey1..."
            className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm xl:text-base"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm md:text-base text-gray-500 dark:text-zinc-400 mb-2">
            New Password (min 8 characters)
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm md:text-base text-gray-500 dark:text-zinc-400 mb-2">
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleImportPrivateKey()}
            placeholder="Confirm password"
            className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            disabled={isLoading}
          />
        </div>

        {/* Real-time password validation */}
        {password.length > 0 && password.length < 8 && (
          <p className="text-xs text-red-400">Password must be at least 8 characters</p>
        )}
        {confirmPassword.length > 0 && password !== confirmPassword && (
          <p className="text-xs text-red-400">Passwords do not match</p>
        )}

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-2 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-900 dark:text-white rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImportPrivateKey}
            disabled={isLoading || !privateKey.trim() || password.length < 8 || password !== confirmPassword}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 text-white font-medium rounded transition-colors"
          >
            {isLoading ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
