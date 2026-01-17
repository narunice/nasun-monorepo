/**
 * NetworkSelector Component
 * Displays current network and opens modal for selection
 * Replaces inline expansion with modal to prevent wallet height changes
 */

import { useState } from 'react';
import { useChain } from '@nasun/wallet';
import { NetworkSelectorModal } from './NetworkSelectorModal';

export interface NetworkSelectorProps {
  /** Additional class names */
  className?: string;
}

/**
 * Network selector trigger component
 * Shows current network and opens modal on click
 */
export function NetworkSelector({ className = '' }: NetworkSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { chain: currentChain } = useChain();

  return (
    <div className={className}>
      {/* Current network display - click to open modal */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="w-full px-3 py-2 flex items-center justify-between
          text-sm text-gray-700 dark:text-zinc-300
          hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-zinc-400">Network:</span>
          <span className="font-medium">{currentChain.name}</span>
          {currentChain.type === 'evm' && (
            <span className="text-xs text-purple-500 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 rounded">
              EVM
            </span>
          )}
          {currentChain.testnet && (
            <span className="text-xs text-amber-500 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">
              Testnet
            </span>
          )}
        </div>
        <svg
          className="w-4 h-4 text-gray-400 dark:text-zinc-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 9l4-4 4 4m0 6l-4 4-4-4"
          />
        </svg>
      </button>

      {/* Network selection modal */}
      {isModalOpen && (
        <NetworkSelectorModal onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
}
