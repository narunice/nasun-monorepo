/**
 * InlineTokenSelector
 * Popover-based token selector for swap form.
 * Shows current token as a clickable badge, opens dropdown on click.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface TokenOption {
  symbol: string;
  name: string;
}

interface InlineTokenSelectorProps {
  selectedToken: string;
  tokens: TokenOption[];
  onSelect: (symbol: string) => void;
  disabled?: boolean;
}

export function InlineTokenSelector({
  selectedToken,
  tokens,
  onSelect,
  disabled = false,
}: InlineTokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasMultipleOptions = tokens.length > 1;

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, handleClickOutside]);

  const handleSelect = (symbol: string) => {
    onSelect(symbol);
    setIsOpen(false);
  };

  const canOpen = !disabled && hasMultipleOptions;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => canOpen && setIsOpen(!isOpen)}
        disabled={!canOpen}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
          canOpen
            ? 'bg-theme-bg-tertiary hover:bg-theme-bg-secondary text-theme-text-primary cursor-pointer'
            : 'bg-theme-bg-tertiary text-theme-text-muted cursor-default'
        }`}
      >
        <span>{selectedToken}</span>
        {canOpen && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 8 8"
            fill="none"
            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
          >
            <path
              d="M2 3l2 2 2-2"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-40 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg z-50 py-1 max-h-48 overflow-y-auto">
          {tokens.map((token) => (
            <button
              key={token.symbol}
              onClick={() => handleSelect(token.symbol)}
              className={`w-full flex flex-col items-start px-3 py-2 text-sm hover:bg-theme-bg-tertiary transition-colors ${
                token.symbol === selectedToken ? 'text-pd1' : 'text-theme-text-primary'
              }`}
            >
              <span className="font-semibold">{token.symbol}</span>
              <span className="text-xs text-theme-text-muted">{token.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
