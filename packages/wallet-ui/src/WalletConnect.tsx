/**
 * Nasun Wallet Connection UI
 * Wallet creation, unlock, import, export, status display
 */

import { useState, useCallback } from 'react';
import { useWallet, shortenAddress } from '@nasun/wallet';
import { MnemonicBackup } from './MnemonicBackup';
import { ImportWallet } from './ImportWallet';
import { ExportPrivateKey } from './ExportPrivateKey';
import { SendTransaction } from './SendTransaction';

type ViewMode =
  | 'main'
  | 'create'
  | 'create-backup'  // Mnemonic backup screen
  | 'unlock'
  | 'import'         // Recovery screen
  | 'export'         // Export private key
  | 'send';          // Token transfer

export function WalletConnect() {
  const {
    status,
    account,
    isLoading,
    error,
    createWalletWithBackup,
    unlockWallet,
    lockWallet,
    deleteWallet,
    importFromMnemonic,
    importFromPrivateKey,
    exportPrivateKey,
    clearError,
  } = useWallet();

  const [viewMode, setViewMode] = useState<ViewMode>('main');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);

  // Create wallet with mnemonic backup
  const handleCreate = useCallback(async () => {
    if (password.length < 8) {
      return;
    }
    if (password !== confirmPassword) {
      return;
    }

    try {
      const result = await createWalletWithBackup(password);
      setMnemonic(result.mnemonic);
      setPassword('');
      setConfirmPassword('');
      setViewMode('create-backup');
    } catch {
      // Error is stored in state
    }
  }, [password, confirmPassword, createWalletWithBackup]);

  // After mnemonic backup confirmed
  const handleBackupConfirmed = useCallback(() => {
    setMnemonic(null);
    setViewMode('main');
  }, []);

  // Unlock wallet
  const handleUnlock = useCallback(async () => {
    try {
      await unlockWallet(password);
      setPassword('');
      setViewMode('main');
    } catch {
      // Error is stored in state
    }
  }, [password, unlockWallet]);

  // Import from mnemonic
  const handleImportMnemonic = useCallback(async (mnemonicPhrase: string, pwd: string) => {
    await importFromMnemonic(mnemonicPhrase, pwd);
    setViewMode('main');
  }, [importFromMnemonic]);

  // Import from private key
  const handleImportPrivateKey = useCallback(async (privateKey: string, pwd: string) => {
    await importFromPrivateKey(privateKey, pwd);
    setViewMode('main');
  }, [importFromPrivateKey]);

  // Export private key
  const handleExportPrivateKey = useCallback(async (pwd: string) => {
    return await exportPrivateKey(pwd);
  }, [exportPrivateKey]);

  // Reset view
  const resetView = useCallback(() => {
    setViewMode('main');
    setPassword('');
    setConfirmPassword('');
    setMnemonic(null);
    clearError();
  }, [clearError]);

  // Delete wallet confirmation
  const handleDelete = useCallback(() => {
    if (confirm('Are you sure you want to delete your wallet? This action cannot be undone.')) {
      deleteWallet();
      setShowDropdown(false);
    }
  }, [deleteWallet]);

  // Mnemonic backup screen - shown after wallet creation
  if (viewMode === 'create-backup' && mnemonic) {
    return (
      <div className="min-w-[320px]">
        <MnemonicBackup
          mnemonic={mnemonic}
          onConfirm={handleBackupConfirmed}
        />
      </div>
    );
  }

  // Disconnected state - need to create or import wallet
  if (status === 'disconnected') {
    // Create wallet form
    if (viewMode === 'create') {
      return (
        <div className="flex flex-col gap-2 p-4 bg-zinc-800 rounded-lg min-w-[280px]">
          <h3 className="text-sm font-medium text-white mb-2">Create New Wallet</h3>

          <input
            type="password"
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-white text-sm focus:outline-none focus:border-yellow-500"
            disabled={isLoading}
          />

          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-white text-sm focus:outline-none focus:border-yellow-500"
            disabled={isLoading}
          />

          {password.length > 0 && password.length < 8 && (
            <p className="text-xs text-red-400">Password must be at least 8 characters</p>
          )}

          {confirmPassword.length > 0 && password !== confirmPassword && (
            <p className="text-xs text-red-400">Passwords do not match</p>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 mt-2">
            <button
              onClick={resetView}
              className="flex-1 px-3 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isLoading || password.length < 8 || password !== confirmPassword}
              className="flex-1 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-zinc-600 disabled:text-zinc-400 text-black font-medium rounded text-sm transition-colors"
            >
              {isLoading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      );
    }

    // Import wallet screen
    if (viewMode === 'import') {
      return (
        <div className="min-w-[320px]">
          <ImportWallet
            onImportMnemonic={handleImportMnemonic}
            onImportPrivateKey={handleImportPrivateKey}
            onCancel={resetView}
            isLoading={isLoading}
          />
        </div>
      );
    }

    // Main disconnected view - show create and import buttons
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setViewMode('create')}
          className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-medium rounded text-sm transition-colors"
        >
          Create Wallet
        </button>
        <button
          onClick={() => setViewMode('import')}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm transition-colors"
        >
          Import
        </button>
      </div>
    );
  }

  // Locked state - need password input
  if (status === 'locked') {
    // Import wallet (for locked state - replaces existing wallet)
    if (viewMode === 'import') {
      return (
        <div className="min-w-[320px]">
          <ImportWallet
            onImportMnemonic={handleImportMnemonic}
            onImportPrivateKey={handleImportPrivateKey}
            onCancel={resetView}
            isLoading={isLoading}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 p-4 bg-zinc-800 rounded-lg min-w-[280px]">
        <h3 className="text-sm font-medium text-white mb-2">Unlock Wallet</h3>

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-white text-sm focus:outline-none focus:border-yellow-500"
          disabled={isLoading}
          autoFocus
        />

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setViewMode('import')}
            className="px-3 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
            disabled={isLoading}
            title="Import a different wallet"
          >
            Import
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
            disabled={isLoading}
          >
            Delete
          </button>
          <button
            onClick={handleUnlock}
            disabled={isLoading || !password}
            className="flex-1 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-zinc-600 disabled:text-zinc-400 text-black font-medium rounded text-sm transition-colors"
          >
            {isLoading ? 'Unlocking...' : 'Unlock'}
          </button>
        </div>
      </div>
    );
  }

  // Connected state - show address
  if (status === 'unlocked' && account) {
    // Export private key view
    if (viewMode === 'export') {
      return (
        <div className="min-w-[320px]">
          <ExportPrivateKey
            onExport={handleExportPrivateKey}
            onClose={() => setViewMode('main')}
          />
        </div>
      );
    }

    // Send transaction view
    if (viewMode === 'send') {
      return (
        <div className="min-w-[320px]">
          <SendTransaction
            onClose={() => setViewMode('main')}
            onSuccess={() => {
              // Optionally return to main view on success
            }}
          />
        </div>
      );
    }

    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded text-sm transition-colors"
        >
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-white font-mono">{shortenAddress(account.address)}</span>
          <svg
            className={`w-4 h-4 text-zinc-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDropdown && (
          <div className="absolute right-0 mt-2 w-52 bg-zinc-800 border border-zinc-600 rounded-lg shadow-lg overflow-hidden z-50">
            <div className="px-3 py-2 border-b border-zinc-700">
              <p className="text-xs text-zinc-400">Connected Address</p>
              <p className="text-xs text-white font-mono break-all mt-1">{account.address}</p>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(account.address);
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Address
            </button>

            <button
              onClick={() => {
                setShowDropdown(false);
                setViewMode('send');
              }}
              className="w-full px-3 py-2 text-left text-sm text-yellow-400 hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send NASUN
            </button>

            <button
              onClick={() => {
                setShowDropdown(false);
                setViewMode('export');
              }}
              className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Export Private Key
            </button>

            <button
              onClick={() => {
                lockWallet();
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Lock
            </button>

            <button
              onClick={handleDelete}
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-zinc-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Wallet
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
