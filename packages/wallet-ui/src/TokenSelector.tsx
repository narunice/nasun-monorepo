/**
 * Token Selector Component
 * Dropdown for selecting a token from registered tokens
 */

import { useState, useRef, useEffect } from 'react';
import { getAllTokens, useMultiBalance, type TokenConfig } from '@nasun/wallet';

interface TokenSelectorProps {
  // Currently selected token symbol
  value: string;
  // Callback when token is selected
  onChange: (symbol: string) => void;
  // Only show specific tokens (optional, defaults to all registered)
  tokens?: TokenConfig[];
  // Show balance next to token name
  showBalance?: boolean;
  // Disabled state
  disabled?: boolean;
  // Custom class
  className?: string;
}

export function TokenSelector({
  value,
  onChange,
  tokens,
  showBalance = true,
  disabled = false,
  className = '',
}: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: balances } = useMultiBalance();

  // Get tokens to display
  const availableTokens = tokens || getAllTokens();
  const selectedToken = availableTokens.find((t) => t.symbol === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Get balance for a token
  const getBalance = (symbol: string): string | undefined => {
    if (!balances) return undefined;
    if (symbol === 'NSN') return balances.native.formatted;
    return balances.tokens[symbol]?.formatted;
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Selected token button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          flex items-center justify-between gap-2 w-full px-3 py-2
          bg-gray-200 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md
          text-gray-900 dark:text-white text-sm font-medium
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-400 dark:hover:border-zinc-600 cursor-pointer'}
          transition-colors
        `}
      >
        <div className="flex items-center gap-2">
          {selectedToken?.icon && (
            <img src={selectedToken.icon} alt="" className="w-5 h-5 rounded-full" />
          )}
          <span>{selectedToken?.symbol || 'Select token'}</span>
          {showBalance && selectedToken && (
            <span className="text-gray-500 dark:text-zinc-400 text-xs">
              ({getBalance(selectedToken.symbol) || '0'})
            </span>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-gray-500 dark:text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 py-1 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-md shadow-lg">
          {availableTokens.map((token) => {
            const balance = getBalance(token.symbol);
            const isSelected = token.symbol === value;

            return (
              <button
                key={token.symbol}
                type="button"
                onClick={() => {
                  onChange(token.symbol);
                  setIsOpen(false);
                }}
                className={`
                  flex items-center justify-between w-full px-3 py-2
                  text-sm text-left
                  ${isSelected ? 'bg-gray-100 dark:bg-zinc-700 text-blue-500 dark:text-blue-400' : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-700/50'}
                  transition-colors
                `}
              >
                <div className="flex items-center gap-2">
                  {token.icon && (
                    <img src={token.icon} alt="" className="w-5 h-5 rounded-full" />
                  )}
                  <div className="flex flex-col">
                    <span className="font-medium">{token.symbol}</span>
                    <span className="text-xs text-gray-500 dark:text-zinc-400">{token.name}</span>
                  </div>
                </div>

                {showBalance && balance && (
                  <span className="text-xs text-gray-500 dark:text-zinc-400">{balance}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
