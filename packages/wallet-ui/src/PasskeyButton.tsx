/**
 * Passkey Authentication Button
 *
 * Provides a simple interface for passkey-based wallet authentication.
 * Shows different states: setup, unlock, or connected.
 */

import { useState, useCallback } from 'react';
import { usePasskey, shortenAddress } from '@nasun/wallet';

export interface PasskeyButtonProps {
  /** Callback when wallet is connected */
  onConnect?: (address: string) => void;
  /** Callback when wallet is disconnected */
  onDisconnect?: () => void;
  /** Custom class name */
  className?: string;
  /** Show compact version */
  compact?: boolean;
}

type ViewState = 'idle' | 'setup' | 'authenticating';

/**
 * PasskeyButton - Passkey-based wallet authentication
 *
 * Usage:
 * ```tsx
 * <PasskeyButton onConnect={(address) => console.log('Connected:', address)} />
 * ```
 */
export function PasskeyButton({
  onConnect,
  onDisconnect,
  className = '',
  compact = false,
}: PasskeyButtonProps) {
  const {
    isSupported,
    isPlatformAvailable,
    wallet,
    isUnlocked,
    isLoading,
    error,
    address,
    createWallet,
    unlock,
    lock,
    deleteWallet,
  } = usePasskey();

  const [viewState, setViewState] = useState<ViewState>('idle');
  const [userName, setUserName] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  // Handle passkey setup (registration)
  const handleSetup = useCallback(async () => {
    if (!userName.trim()) {
      return;
    }

    setViewState('authenticating');
    try {
      const newAddress = await createWallet(userName);
      onConnect?.(newAddress);
      setViewState('idle');
      setUserName('');
    } catch (err) {
      console.error('Passkey setup failed:', err);
      setViewState('setup');
    }
  }, [userName, createWallet, onConnect]);

  // Handle passkey unlock (authentication)
  const handleUnlock = useCallback(async () => {
    setViewState('authenticating');
    try {
      await unlock();
      if (address) {
        onConnect?.(address);
      }
      setViewState('idle');
    } catch (err) {
      console.error('Passkey unlock failed:', err);
      setViewState('idle');
    }
  }, [unlock, address, onConnect]);

  // Handle lock
  const handleLock = useCallback(() => {
    lock();
    onDisconnect?.();
    setShowMenu(false);
  }, [lock, onDisconnect]);

  // Handle delete
  const handleDelete = useCallback(() => {
    if (confirm('Are you sure you want to delete this wallet? This action cannot be undone.')) {
      deleteWallet();
      onDisconnect?.();
      setShowMenu(false);
    }
  }, [deleteWallet, onDisconnect]);

  // Not supported
  if (!isSupported) {
    return (
      <div className={`text-gray-500 text-sm ${className}`}>
        Passkey not supported in this browser
      </div>
    );
  }

  // Platform authenticator not available
  if (isPlatformAvailable === false) {
    return (
      <div className={`text-gray-500 text-sm ${className}`}>
        No biometric authenticator available
      </div>
    );
  }

  // Loading state
  if (isLoading || isPlatformAvailable === null) {
    return (
      <button
        disabled
        className={`flex items-center gap-2 px-4 py-2 bg-gray-600 text-gray-300 rounded-lg cursor-not-allowed ${className}`}
      >
        <Spinner />
        <span>Loading...</span>
      </button>
    );
  }

  // Authenticating state
  if (viewState === 'authenticating') {
    return (
      <button
        disabled
        className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-not-allowed ${className}`}
      >
        <Spinner />
        <span>Authenticating...</span>
      </button>
    );
  }

  // Connected state
  if (isUnlocked && address) {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
        >
          <PasskeyIcon />
          {compact ? (
            <span>Connected</span>
          ) : (
            <span>{shortenAddress(address)}</span>
          )}
          <ChevronIcon open={showMenu} />
        </button>

        {showMenu && (
          <div className="absolute top-full right-0 mt-2 w-48 bg-zinc-800 dark:bg-zinc-800 bg-white border border-zinc-700 dark:border-zinc-700 border-gray-200 rounded-lg shadow-lg z-50">
            <div className="p-2 border-b border-zinc-700 dark:border-zinc-700 border-gray-200">
              <div className="text-xs text-gray-400 dark:text-gray-400 text-gray-500">Address</div>
              <div className="text-sm font-mono text-white dark:text-white text-gray-900 truncate">
                {shortenAddress(address)}
              </div>
            </div>
            <button
              onClick={handleLock}
              className="w-full px-4 py-2 text-left text-sm text-gray-300 dark:text-gray-300 text-gray-700 hover:bg-zinc-700 dark:hover:bg-zinc-700 hover:bg-gray-100"
            >
              Lock Wallet
            </button>
            <button
              onClick={handleDelete}
              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-zinc-700 dark:hover:bg-zinc-700 hover:bg-gray-100"
            >
              Delete Wallet
            </button>
          </div>
        )}
      </div>
    );
  }

  // Has wallet but locked - show unlock button
  if (wallet && !isUnlocked) {
    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={handleUnlock}
          className={`flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${className}`}
        >
          <PasskeyIcon />
          <span>Unlock with Passkey</span>
        </button>
        {error && (
          <div className="text-sm text-red-400">{error.message}</div>
        )}
      </div>
    );
  }

  // Setup state - show registration form
  if (viewState === 'setup') {
    return (
      <div className={`flex flex-col gap-3 p-4 bg-zinc-800 dark:bg-zinc-800 bg-gray-100 rounded-lg ${className}`}>
        <h3 className="text-sm font-medium text-white dark:text-white text-gray-900">
          Setup Passkey Wallet
        </h3>
        <p className="text-xs text-gray-400 dark:text-gray-400 text-gray-600">
          Use Face ID, Touch ID, or Windows Hello to secure your wallet.
        </p>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Enter your name"
          className="px-3 py-2 bg-zinc-700 dark:bg-zinc-700 bg-white border border-zinc-600 dark:border-zinc-600 border-gray-300 rounded-lg text-white dark:text-white text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setViewState('idle')}
            className="flex-1 px-3 py-2 bg-zinc-700 dark:bg-zinc-700 bg-gray-200 hover:bg-zinc-600 dark:hover:bg-zinc-600 hover:bg-gray-300 text-gray-300 dark:text-gray-300 text-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSetup}
            disabled={!userName.trim()}
            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
          >
            Create Wallet
          </button>
        </div>
        {error && (
          <div className="text-sm text-red-400">{error.message}</div>
        )}
      </div>
    );
  }

  // Idle state - show setup button
  return (
    <button
      onClick={() => setViewState('setup')}
      className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${className}`}
    >
      <PasskeyIcon />
      <span>Setup Passkey Wallet</span>
    </button>
  );
}

// ============================================
// Helper Components
// ============================================

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function PasskeyIcon() {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a5 5 0 0 1 5 5v3a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V7a5 5 0 0 1 5-5z" />
      <path d="M12 13v9" />
      <path d="M9 22h6" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
