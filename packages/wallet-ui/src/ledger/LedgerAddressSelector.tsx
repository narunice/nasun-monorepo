/**
 * LedgerAddressSelector Component
 *
 * Allows users to select from multiple derived addresses on their Ledger.
 * Shows address, derivation path, and optional balance.
 *
 * UX Principle: Clear labeling, easy selection, show what matters
 */

import type { LedgerChainType } from '@nasun/wallet';
import { Tooltip } from '../shared';
import * as React from 'react';

export interface LedgerAddress {
  /** Address index (0-based) */
  index: number;
  /** Derived address */
  address: string;
  /** Balance in native token (formatted) */
  balance?: string;
  /** USD value if available */
  usdValue?: number;
  /** Whether address has been used on-chain */
  isUsed?: boolean;
}

export interface LedgerAddressSelectorProps {
  /** Currently selected address index */
  selectedIndex: number;
  /** Selection change callback */
  onSelect: (index: number) => void;
  /** List of addresses to display */
  addresses: LedgerAddress[];
  /** Chain type for path display */
  chainType: LedgerChainType;
  /** Whether addresses are loading */
  isLoading?: boolean;
  /** Load more addresses callback */
  onLoadMore?: () => void;
  /** Whether more addresses can be loaded */
  hasMore?: boolean;
  /** Show balance column */
  showBalance?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Format address for display
 */
function formatAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

/**
 * Get derivation path for display
 */
function getPathDisplay(chainType: LedgerChainType, index: number): string {
  if (chainType === 'move') {
    return `m/44'/784'/0'/0'/${index}'`;
  }
  return `44'/60'/0'/0/${index}`;
}

/**
 * Ledger address selector component
 *
 * @example
 * <LedgerAddressSelector
 *   selectedIndex={0}
 *   onSelect={handleSelect}
 *   addresses={derivedAddresses}
 *   chainType="move"
 *   showBalance
 * />
 */
export function LedgerAddressSelector({
  selectedIndex,
  onSelect,
  addresses,
  chainType,
  isLoading = false,
  onLoadMore,
  hasMore = false,
  showBalance = true,
  className = '',
}: LedgerAddressSelectorProps) {
  if (addresses.length === 0 && isLoading) {
    return (
      <div className={`p-6 text-center ${className}`}>
        <LoadingSpinner />
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Loading addresses from your Ledger...
        </p>
      </div>
    );
  }

  if (addresses.length === 0) {
    return (
      <div className={`p-6 text-center ${className}`}>
        <p className="text-gray-600 dark:text-gray-400">
          No addresses found. Make sure your Ledger is connected.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            Select Address
          </h3>
          <Tooltip
            content="Choose which address to use from your Ledger device"
            size="xs"
          />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {chainType === 'move' ? 'Sui/Nasun' : 'Ethereum'} addresses
        </span>
      </div>

      {/* Address list */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {addresses.map((addr) => (
          <AddressRow
            key={addr.index}
            address={addr}
            chainType={chainType}
            isSelected={addr.index === selectedIndex}
            onSelect={() => onSelect(addr.index)}
            showBalance={showBalance}
          />
        ))}

        {/* Loading more */}
        {isLoading && addresses.length > 0 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-center">
            <LoadingSpinner size="sm" />
          </div>
        )}

        {/* Load more button */}
        {hasMore && !isLoading && onLoadMore && (
          <button
            onClick={onLoadMore}
            className="w-full p-3 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-t border-gray-200 dark:border-gray-700 transition-colors"
          >
            Load more addresses
          </button>
        )}
      </div>

      {/* Path info */}
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        Using BIP-44 derivation path for{' '}
        {chainType === 'move' ? 'Sui/Nasun' : 'Ethereum'}
      </p>
    </div>
  );
}

interface AddressRowProps {
  address: LedgerAddress;
  chainType: LedgerChainType;
  isSelected: boolean;
  onSelect: () => void;
  showBalance: boolean;
}

/**
 * Individual address row
 */
function AddressRow({
  address,
  chainType,
  isSelected,
  onSelect,
  showBalance,
}: AddressRowProps) {
  return (
    <button
      onClick={onSelect}
      className={`
        w-full flex items-center gap-4 p-4 text-left transition-colors
        ${isSelected
          ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-2 border-l-transparent'
        }
        ${address.index > 0 ? 'border-t border-gray-200 dark:border-gray-700' : ''}
      `}
    >
      {/* Selection indicator */}
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          isSelected
            ? 'border-blue-500 bg-blue-500'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        {isSelected && (
          <svg
            className="w-3 h-3 text-white"
            fill="currentColor"
            viewBox="0 0 12 12"
          >
            <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        )}
      </div>

      {/* Address info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-gray-900 dark:text-white">
            {formatAddress(address.address)}
          </span>
          {address.isUsed && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
              Used
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
          {getPathDisplay(chainType, address.index)}
        </span>
      </div>

      {/* Balance */}
      {showBalance && address.balance !== undefined && (
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {address.balance}
          </p>
          {address.usdValue !== undefined && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ${address.usdValue.toFixed(2)}
            </p>
          )}
        </div>
      )}
    </button>
  );
}

/**
 * Loading spinner component
 */
function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-5 h-5' : 'w-8 h-8';

  return (
    <svg
      className={`animate-spin ${sizeClass} mx-auto text-blue-500`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
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

/**
 * Compact address selector (dropdown variant)
 */
export function LedgerAddressDropdown({
  selectedIndex,
  onSelect,
  addresses,
  chainType,
  isLoading,
  className = '',
}: Omit<LedgerAddressSelectorProps, 'showBalance' | 'onLoadMore' | 'hasMore'>) {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedAddress = addresses.find((a) => a.index === selectedIndex);

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-left hover:border-gray-400 dark:hover:border-gray-500 transition-colors disabled:opacity-50"
      >
        <div>
          {selectedAddress ? (
            <>
              <p className="font-mono text-sm text-gray-900 dark:text-white">
                {formatAddress(selectedAddress.address)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Account {selectedAddress.index + 1}
              </p>
            </>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">Select address...</p>
          )}
        </div>
        <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
            {addresses.map((addr) => (
              <button
                key={addr.index}
                onClick={() => {
                  onSelect(addr.index);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                  addr.index === selectedIndex
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : ''
                }`}
              >
                <span className="text-sm font-mono text-gray-900 dark:text-white">
                  {formatAddress(addr.address)}
                </span>
                {addr.balance && (
                  <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                    {addr.balance}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
