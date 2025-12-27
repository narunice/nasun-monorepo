import { useState, useEffect } from 'react';
import { useWallet } from '@nasun/wallet';
import { useWalletModal } from '../../providers';
import { WalletDropdown } from '../wallet/WalletDropdown';

export function Header() {
  const { status, account } = useWallet();
  const { openWalletModal } = useWalletModal();
  const [showWalletDetails, setShowWalletDetails] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showWalletDetails && !(e.target as Element).closest('.wallet-dropdown')) {
        setShowWalletDetails(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showWalletDetails]);

  return (
    <header className="border-b border-gray-800 px-6 py-4">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <img src="/temp-logo.png" alt="Pado" className="w-8 h-8" />
          <h1 className="text-2xl font-bold text-blue-400">Pado</h1>
        </div>
        <div className="flex items-center gap-4">
          {/* Disconnected: Connect Wallet button */}
          {status === 'disconnected' && (
            <button
              onClick={() => openWalletModal('connect')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Connect Wallet
            </button>
          )}

          {/* Locked: Unlock button */}
          {status === 'locked' && (
            <button
              onClick={() => openWalletModal('unlock')}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Unlock Wallet
            </button>
          )}

          {/* Unlocked: Address dropdown */}
          {status === 'unlocked' && account && (
            <div className="relative wallet-dropdown">
              <button
                onClick={() => setShowWalletDetails(!showWalletDetails)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700"
              >
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-300 font-mono">
                  {account.address.slice(0, 8)}...{account.address.slice(-6)}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${showWalletDetails ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showWalletDetails && (
                <WalletDropdown onClose={() => setShowWalletDetails(false)} />
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
