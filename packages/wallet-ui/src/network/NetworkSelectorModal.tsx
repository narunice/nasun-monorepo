/**
 * NetworkSelectorModal Component
 * Full-screen modal for network selection
 * Separated from inline dropdown to prevent wallet height expansion
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useChain, useChainStore, type ChainConfig } from '@nasun/wallet';
import { useAdvancedMode } from '../stores/uiSettingsStore';

export interface NetworkSelectorModalProps {
  /** Callback when modal should close */
  onClose: () => void;
}

/**
 * Modal for selecting blockchain network
 * Shows Move chains always, EVM chains only in Pro Mode
 */
export function NetworkSelectorModal({ onClose }: NetworkSelectorModalProps) {
  const { chain: currentChain, nasunChains, externalMoveChains, evmChains } = useChain();
  const isAdvancedMode = useAdvancedMode();
  const [search, setSearch] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleSelect = useCallback(
    (chainId: string, isEnabled: boolean) => {
      if (isEnabled) {
        // Use store directly to ensure state update outside React lifecycle
        useChainStore.getState().setChain(chainId);
        // Delay close to ensure state update propagates
        requestAnimationFrame(() => {
          onClose();
        });
      }
    },
    [onClose]
  );

  // Filter chains by search
  const filterChains = (chains: ChainConfig[]) => {
    if (!search.trim()) return chains;
    const searchLower = search.toLowerCase();
    return chains.filter((c) => c.name.toLowerCase().includes(searchLower));
  };

  // Separate chain groups
  const filteredNasunChains = filterChains(nasunChains);
  const filteredExternalMoveChains = filterChains(externalMoveChains);
  const evmMainnets = filterChains(evmChains.filter((c) => !c.testnet));
  const evmTestnets = filterChains(evmChains.filter((c) => c.testnet));

  const renderChainItem = (
    chain: ChainConfig,
    sectionEnabled: boolean,
    disabledReason?: string
  ) => {
    const isSelected = currentChain.id === chain.id;
    const isChainDisabled = chain.disabled || !sectionEnabled;

    return (
      <button
        key={chain.id}
        onClick={(e) => {
          e.stopPropagation();
          if (!isChainDisabled) {
            handleSelect(chain.id, true);
          }
        }}
        disabled={isChainDisabled}
        className={`
          w-full px-4 py-3 text-left flex items-center justify-between
          transition-colors text-sm xl:text-base rounded-lg mb-1
          ${
            !isChainDisabled
              ? 'hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer'
              : 'cursor-not-allowed opacity-50'
          }
          ${
            isSelected
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-800'
              : 'text-gray-700 dark:text-zinc-300'
          }
        `}
      >
        <div className="flex items-center gap-3">
          {/* Selection indicator */}
          <span
            className={`
              w-2.5 h-2.5 rounded-full flex-shrink-0
              ${
                isSelected
                  ? 'bg-blue-500'
                  : !isChainDisabled
                    ? 'border-2 border-gray-300 dark:border-zinc-600'
                    : 'border-2 border-gray-200 dark:border-zinc-700'
              }
            `}
          />
          <div>
            <span className="font-medium">
              {chain.name}
              {chain.disabled && (
                <span className="ml-1 text-gray-400 dark:text-zinc-400 font-normal">
                  (Soon)
                </span>
              )}
            </span>
            {chain.devnet && (
              <span className="ml-2 text-xs xl:text-sm text-amber-500 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded font-medium">
                Devnet
              </span>
            )}
            {chain.testnet && !chain.devnet && (
              <span className="ml-2 text-xs xl:text-sm text-gray-400 dark:text-zinc-400">
                Testnet
              </span>
            )}
            {chain.addressScheme === 'iota' && (
              <p className="text-[10px] xl:text-xs text-amber-500/80 dark:text-amber-400/70 mt-0.5 leading-tight">
                Mnemonic not compatible with official IOTA Wallet.
                Export private key for external recovery.
              </p>
            )}
          </div>
        </div>

        {/* Badge for disabled sections (e.g. Pro Mode required) */}
        {!sectionEnabled && disabledReason && (
          <span className="text-xs xl:text-sm text-gray-400 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-700 px-2 py-0.5 rounded">
            {disabledReason}
          </span>
        )}

        {/* Selected checkmark */}
        {isSelected && (
          <svg
            className="w-5 h-5 text-blue-500 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
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
      <div className="mb-4">
        <div className="px-4 py-2 text-xs xl:text-sm font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
          {title}
        </div>
        <div className="px-2">
          {chains.map((chain) =>
            renderChainItem(chain, isEnabled, disabledReason)
          )}
        </div>
      </div>
    );
  };

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        data-network-modal="true"
        className="fixed inset-0 bg-black/50 z-[99999] transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        data-network-modal="true"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-[420px] max-h-[85vh] bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl z-[100000] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-zinc-700">
          <h3 className="text-lg xl:text-xl font-semibold text-gray-900 dark:text-white">
            Select Network
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-700">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search networks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-100 dark:bg-zinc-700 border-0 rounded-lg text-sm xl:text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Network List */}
        <div className="flex-1 overflow-y-auto py-3">
          {/* Nasun Networks - Always enabled */}
          {renderSection(
            'Nasun Networks',
            filteredNasunChains,
            true
          )}

          {/* External Move Testnets (Sui, IOTA) - Pro Mode only */}
          {filteredExternalMoveChains.length > 0 && (
            <>
              <div className="border-t border-gray-100 dark:border-zinc-700 my-2" />
              {renderSection(
                'Move Testnets',
                filteredExternalMoveChains,
                isAdvancedMode,
                'Pro Mode'
              )}
            </>
          )}

          {/* EVM Mainnets - Hidden for development wallet to avoid real asset deposits */}
          {/* {evmMainnets.length > 0 && (
            <>
              <div className="border-t border-gray-100 dark:border-zinc-700 my-2" />
              {renderSection(
                'EVM Mainnets',
                evmMainnets,
                isAdvancedMode,
                'Pro Mode'
              )}
            </>
          )} */}

          {/* EVM Testnets */}
          {evmTestnets.length > 0 && (
            <>
              <div className="border-t border-gray-100 dark:border-zinc-700 my-2" />
              {renderSection(
                'EVM Testnets',
                evmTestnets,
                isAdvancedMode,
                'Pro Mode'
              )}
            </>
          )}

          {/* Hint when Pro Mode is off */}
          {!isAdvancedMode && (evmChains.length > 0 || externalMoveChains.length > 0) && (
            <div className="mx-4 mt-2 px-4 py-3 bg-gray-50 dark:bg-zinc-700/50 rounded-lg">
              <p className="text-xs xl:text-sm text-gray-500 dark:text-zinc-400">
                Enable <span className="font-medium">Pro Mode</span> in
                Settings to access external Move and EVM networks.
              </p>
            </div>
          )}

          {/* No results */}
          {search &&
            filteredNasunChains.length === 0 &&
            filteredExternalMoveChains.length === 0 &&
            evmMainnets.length === 0 &&
            evmTestnets.length === 0 && (
              <div className="px-4 py-8 text-center text-gray-400 dark:text-zinc-400">
                No networks found for "{search}"
              </div>
            )}
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
