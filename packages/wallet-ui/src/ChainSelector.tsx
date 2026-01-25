/**
 * Chain Selector Component
 *
 * Dropdown selector for switching between Move and EVM chains.
 * Groups chains by type and shows testnet indicators.
 * Only visible in Advanced Mode.
 */

import { useState, useRef, useEffect } from 'react';
import { useChain } from '@nasun/wallet';
import type { ChainConfig } from '@nasun/wallet';

export interface ChainSelectorProps {
  /** Custom class name */
  className?: string;
  /** Show "Network:" label */
  showLabel?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
}

/**
 * Get chain type icon
 */
function ChainTypeIcon({ type, className = '' }: { type: 'move' | 'evm'; className?: string }) {
  if (type === 'move') {
    // Sui/Move icon (simplified)
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeWidth="2" stroke="currentColor" fill="none" />
      </svg>
    );
  }
  // Ethereum/EVM icon (simplified diamond)
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1.5l-7 10.5 7 4.5 7-4.5-7-10.5zM12 22.5l-7-5.5 7 4 7-4-7 5.5z" />
    </svg>
  );
}

export function ChainSelector({
  className = '',
  showLabel = true,
  size = 'md',
}: ChainSelectorProps) {
  const { chain, moveChains, evmChains, switchChain } = useChain();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (chainId: string) => {
    switchChain(chainId);
    setIsOpen(false);
  };

  const sizeClasses = size === 'sm' ? 'text-xs py-1 px-2' : 'text-sm py-1.5 px-3';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Label */}
      {showLabel && (
        <label className="block text-[10px] font-medium text-gray-500 dark:text-zinc-400 mb-1">
          Network
        </label>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded hover:border-gray-300 dark:hover:border-zinc-600 transition-colors ${sizeClasses}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChainTypeIcon type={chain.type} className={`${iconSize} text-gray-500 dark:text-zinc-400`} />
          <span className="text-gray-900 dark:text-white truncate">
            {chain.name}
          </span>
          {chain.testnet && (
            <span className="px-1 py-0.5 text-[9px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
              Testnet
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 dark:text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-md shadow-lg overflow-hidden">
          {/* Move Networks */}
          {moveChains.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider bg-gray-50 dark:bg-zinc-900/50">
                Move Networks
              </div>
              {moveChains.map((c) => (
                <ChainOption
                  key={c.id}
                  chain={c}
                  isSelected={c.id === chain.id}
                  onSelect={handleSelect}
                  size={size}
                />
              ))}
            </>
          )}

          {/* EVM Networks */}
          {evmChains.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider bg-gray-50 dark:bg-zinc-900/50 border-t border-gray-200 dark:border-zinc-700">
                EVM Networks
              </div>
              {evmChains.map((c) => (
                <ChainOption
                  key={c.id}
                  chain={c}
                  isSelected={c.id === chain.id}
                  onSelect={handleSelect}
                  size={size}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Individual chain option in the dropdown
 */
function ChainOption({
  chain,
  isSelected,
  onSelect,
  size,
}: {
  chain: ChainConfig;
  isSelected: boolean;
  onSelect: (id: string) => void;
  size: 'sm' | 'md';
}) {
  const sizeClasses = size === 'sm' ? 'text-xs py-1.5 px-3' : 'text-sm py-2 px-3';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <button
      onClick={() => onSelect(chain.id)}
      className={`w-full flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors ${sizeClasses} ${
        isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
      }`}
    >
      <ChainTypeIcon type={chain.type} className={`${iconSize} text-gray-500 dark:text-zinc-400`} />
      <span className={`flex-1 text-left ${isSelected ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-900 dark:text-white'}`}>
        {chain.name}
      </span>
      {chain.testnet && (
        <span className="px-1 py-0.5 text-[9px] bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
          Testnet
        </span>
      )}
      {chain.aa && (
        <span className="px-1 py-0.5 text-[9px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">
          AA
        </span>
      )}
      {isSelected && (
        <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

export default ChainSelector;
