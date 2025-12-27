import { useState } from 'react';
import { CreateWalletForm } from './CreateWalletForm';
import { ImportWalletForm } from './ImportWalletForm';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'connect' | 'unlock';
  onCreateSuccess?: (mnemonic: string) => void;
}

export function WalletModal({ isOpen, onClose, mode, onCreateSuccess }: WalletModalProps) {
  const [tab, setTab] = useState<'create' | 'import'>('create');

  if (!isOpen) return null;

  const handleCreateSuccess = (mnemonic: string) => {
    onClose();
    onCreateSuccess?.(mnemonic);
  };

  const handleImportSuccess = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-lg w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'connect' ? 'Connect Wallet' : 'Unlock Wallet'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {mode === 'connect' ? (
          <>
            {/* Tabs */}
            <div className="flex border-b border-gray-700">
              <button
                onClick={() => setTab('create')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === 'create'
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800'
                    : 'text-gray-400 hover:text-gray-300 bg-gray-900'
                }`}
              >
                Create Wallet
              </button>
              <button
                onClick={() => setTab('import')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === 'import'
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800'
                    : 'text-gray-400 hover:text-gray-300 bg-gray-900'
                }`}
              >
                Import Wallet
              </button>
            </div>

            <div className="p-6">
              {tab === 'create' && (
                <CreateWalletForm onCreateSuccess={handleCreateSuccess} />
              )}
              {tab === 'import' && (
                <ImportWalletForm onImportSuccess={handleImportSuccess} />
              )}
            </div>
          </>
        ) : (
          <div className="p-6">
            <UnlockFormInline onUnlockSuccess={onClose} />
          </div>
        )}
      </div>
    </div>
  );
}

// UnlockForm 인라인 버전 (모달용)
import { useWallet } from '../../wallet';
import { Button } from '../common';

function UnlockFormInline({ onUnlockSuccess }: { onUnlockSuccess: () => void }) {
  const { unlockWallet } = useWallet();
  const [password, setPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleUnlock = async () => {
    setIsUnlocking(true);
    try {
      await unlockWallet(password);
      setPassword('');
      onUnlockSuccess();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to unlock');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <>
      <p className="text-sm text-gray-400 mb-4">
        Enter your password to unlock the wallet.
      </p>
      <input
        type="password"
        placeholder="Enter password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
        className="w-full px-4 py-2 bg-gray-700 rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />
      <Button onClick={handleUnlock} isLoading={isUnlocking} fullWidth>
        Unlock
      </Button>
    </>
  );
}
