import { useState } from 'react';
import { useWallet } from '@nasun/wallet';
import { useBalance } from '../../hooks/useBalance';
import { Button } from '../common';

interface WalletDropdownProps {
  onClose: () => void;
}

export function WalletDropdown({ onClose }: WalletDropdownProps) {
  const { account, lockWallet } = useWallet();
  const { data: balances, isLoading } = useBalance();
  const [copied, setCopied] = useState(false);

  if (!account) return null;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLock = () => {
    lockWallet();
    onClose();
  };

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-gray-800 rounded-lg border border-gray-700 shadow-xl z-50">
      {/* Address Section */}
      <div className="p-4 border-b border-gray-700">
        <div className="text-xs text-gray-400 mb-1">Wallet Address</div>
        <div className="flex items-center gap-2">
          <code className="text-xs text-gray-300 bg-gray-900 px-2 py-1 rounded flex-1 overflow-hidden text-ellipsis">
            {account.address}
          </code>
          <button
            onClick={handleCopyAddress}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <a
          href={`https://explorer.devnet.nasun.io/address/${account.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300"
        >
          View on Explorer
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      {/* Balances Section */}
      <div className="p-4">
        <div className="text-xs text-gray-400 mb-2">Balances</div>
        {isLoading ? (
          <div className="text-xs text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">NASUN</span>
              <span className="text-white font-mono">{balances?.nasun.formatted || '0'}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">NBTC</span>
              <span className="text-white font-mono">{balances?.nbtc.formatted || '0'}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">NUSDC</span>
              <span className="text-white font-mono">{balances?.nusdc.formatted || '0'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Lock Button */}
      <div className="p-4 border-t border-gray-700">
        <Button onClick={handleLock} variant="danger" fullWidth size="sm">
          Lock Wallet
        </Button>
      </div>
    </div>
  );
}
