/**
 * NetworkSelector Component
 * Displays available networks with current selection and coming soon status
 * Collapsible design - click to expand/collapse
 */

import { useState } from 'react';
import { NETWORKS, type NetworkType, type NetworkInfo } from '@nasun/wallet';

export interface NetworkSelectorProps {
  /** Currently selected network type */
  currentNetwork: NetworkType;
  /** Callback when network is selected (only enabled networks can be selected) */
  onSelect?: (network: NetworkType) => void;
  /** Additional class names */
  className?: string;
}

const NETWORK_ORDER: NetworkType[] = ['devnet', 'testnet', 'mainnet'];

/**
 * Network selector component
 * Shows all networks with enabled/disabled status
 * Collapsible - click header to expand/collapse
 */
export function NetworkSelector({
  currentNetwork,
  onSelect,
  className = '',
}: NetworkSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const currentNetworkInfo = NETWORKS[currentNetwork];

  const handleSelect = (network: NetworkInfo) => {
    if (network.enabled && onSelect) {
      onSelect(network.type);
    }
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
          <span className="font-medium">{currentNetworkInfo.name}</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 dark:text-zinc-500 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable network list */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-zinc-700 py-1">
          {NETWORK_ORDER.map((type) => {
            const network = NETWORKS[type];
            const isSelected = currentNetwork === type;
            const isEnabled = network.enabled;

            return (
              <button
                key={type}
                onClick={() => handleSelect(network)}
                disabled={!isEnabled}
                className={`
                  w-full px-3 py-2 text-left flex items-center justify-between
                  transition-colors text-sm
                  ${isEnabled
                    ? 'hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer'
                    : 'cursor-not-allowed opacity-60'
                  }
                  ${isSelected
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
                      ${isSelected
                        ? 'bg-blue-500'
                        : isEnabled
                          ? 'border border-gray-300 dark:border-zinc-600'
                          : 'border border-gray-200 dark:border-zinc-700'
                      }
                    `}
                  />
                  <span>{network.name}</span>
                </div>

                {/* Coming Soon badge for disabled networks */}
                {!isEnabled && (
                  <span className="text-xs text-gray-400 dark:text-zinc-500">
                    Coming Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
