/**
 * NetworkSelector Component
 * Displays available networks with current selection
 * Synchronized with ChainSelector via useChain hook
 * EVM chains are disabled when Advanced Mode is off
 */

import { useState } from 'react';
import { useChain, type ChainConfig } from '@nasun/wallet';
import { useAdvancedMode } from './stores/uiSettingsStore';

export interface NetworkSelectorProps {
  /** Additional class names */
  className?: string;
}

/**
 * Network selector component
 * Shows all networks grouped by type (Move/EVM)
 * EVM networks require Advanced Mode to be enabled
 */
export function NetworkSelector({ className = '' }: NetworkSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { chain: currentChain, moveChains, evmChains, switchChain } = useChain();
  const isAdvancedMode = useAdvancedMode();

  const handleSelect = (chainConfig: ChainConfig, isEnabled: boolean) => {
    if (isEnabled) {
      switchChain(chainConfig.id);
      setIsExpanded(false);
    }
  };

  // Separate mainnets and testnets for better organization
  const moveMainnets = moveChains.filter((c) => !c.testnet);
  const moveTestnets = moveChains.filter((c) => c.testnet);
  const evmMainnets = evmChains.filter((c) => !c.testnet);
  const evmTestnets = evmChains.filter((c) => c.testnet);

  const renderChainItem = (
    chain: ChainConfig,
    isEnabled: boolean,
    disabledReason?: string
  ) => {
    const isSelected = currentChain.id === chain.id;

    return (
      <button
        key={chain.id}
        onClick={() => handleSelect(chain, isEnabled)}
        disabled={!isEnabled}
        className={`
          w-full px-3 py-2 text-left flex items-center justify-between
          transition-colors text-sm
          ${
            isEnabled
              ? 'hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer'
              : 'cursor-not-allowed opacity-60'
          }
          ${
            isSelected
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
              : 'text-gray-700 dark:text-zinc-300'
          }
        `}
      >
        <div className="flex items-center gap-2">
          {/* Selection indicator */}
          <span
            className={`
              w-2 h-2 rounded-full
              ${
                isSelected
                  ? 'bg-blue-500'
                  : isEnabled
                    ? 'border border-gray-300 dark:border-zinc-600'
                    : 'border border-gray-200 dark:border-zinc-700'
              }
            `}
          />
          <span>{chain.name}</span>
          {chain.testnet && (
            <span className="text-xs text-gray-400 dark:text-zinc-500">
              (Testnet)
            </span>
          )}
        </div>

        {/* Badge for disabled chains */}
        {!isEnabled && disabledReason && (
          <span className="text-xs text-gray-400 dark:text-zinc-500">
            {disabledReason}
          </span>
        )}
      </button>
    );
  };

  const renderSection = (
    title: string,
    chains: ChainConfig[],
    isEnabled: boolean,
    disabledReason?: string
  ) => {
    if (chains.length === 0) return null;

    return (
      <div className="py-1">
        <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
          {title}
        </div>
        {chains.map((chain) =>
          renderChainItem(chain, isEnabled, disabledReason)
        )}
      </div>
    );
  };

  return (
    <div className={className}>
      {/* Collapsible header showing current network */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between
          text-sm text-gray-700 dark:text-zinc-300
          hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-zinc-400">Network:</span>
          <span className="font-medium">{currentChain.name}</span>
          {currentChain.type === 'evm' && (
            <span className="text-xs text-purple-500 dark:text-purple-400">
              EVM
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 dark:text-zinc-500 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expandable network list */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-zinc-700 max-h-80 overflow-y-auto">
          {/* Move Networks - Always enabled */}
          {renderSection('Nasun Networks', [...moveMainnets, ...moveTestnets], true)}

          {/* EVM Mainnets - Require Advanced Mode */}
          {evmMainnets.length > 0 && (
            <>
              <div className="border-t border-gray-100 dark:border-zinc-800" />
              {renderSection(
                'EVM Mainnets',
                evmMainnets,
                isAdvancedMode,
                'Advanced Mode'
              )}
            </>
          )}

          {/* EVM Testnets - Require Advanced Mode */}
          {evmTestnets.length > 0 && (
            <>
              <div className="border-t border-gray-100 dark:border-zinc-800" />
              {renderSection(
                'EVM Testnets',
                evmTestnets,
                isAdvancedMode,
                'Advanced Mode'
              )}
            </>
          )}

          {/* Hint when Advanced Mode is off */}
          {!isAdvancedMode && evmChains.length > 0 && (
            <div className="px-3 py-2 text-xs text-gray-400 dark:text-zinc-500 border-t border-gray-100 dark:border-zinc-800">
              Enable Advanced Mode to access EVM networks
            </div>
          )}
        </div>
      )}
    </div>
  );
}
