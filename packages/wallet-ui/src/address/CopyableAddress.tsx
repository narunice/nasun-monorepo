/**
 * CopyableAddress Component
 * Displays address/ID with copy and explorer link buttons
 */

import { useState, useCallback } from 'react';
import {
  shortenAddress,
  getExplorerTxUrl,
  getExplorerAddressUrl,
  getExplorerObjectUrl,
  useCurrentChainId,
} from '@nasun/wallet';

export interface CopyableAddressProps {
  /** The full address/ID value */
  value: string;
  /** Optional label displayed above the value */
  label?: string;
  /** Number of characters to show on each side when shortened (0 = full display) */
  shorten?: number;
  /** Show copy button (default: true) */
  showCopy?: boolean;
  /** Show explorer link button (default: false) */
  showExplorer?: boolean;
  /** Type of explorer link */
  explorerType?: 'address' | 'object' | 'tx';
  /** Text size */
  size?: 'xs' | 'sm';
  /** Additional className for the value text */
  className?: string;
}

/**
 * Get explorer URL based on type and chain
 */
function getExplorerUrl(value: string, type: 'address' | 'object' | 'tx', chainId?: string): string {
  switch (type) {
    case 'address':
      return getExplorerAddressUrl(value, chainId);
    case 'object':
      return getExplorerObjectUrl(value, chainId);
    case 'tx':
      return getExplorerTxUrl(value, chainId);
    default:
      return getExplorerTxUrl(value, chainId);
  }
}

export function CopyableAddress({
  value,
  label,
  shorten,
  showCopy = true,
  showExplorer = false,
  explorerType = 'tx',
  size = 'sm',
  className = '',
}: CopyableAddressProps) {
  const chainId = useCurrentChainId();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const displayValue = shorten && shorten > 0 ? shortenAddress(value, shorten) : value;
  const textSize = size === 'xs' ? 'text-xs xl:text-sm' : 'text-sm xl:text-base';

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may fail in non-secure contexts or iframe
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2000);
    }
  }, [value]);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <p className="text-xs xl:text-sm text-gray-400 dark:text-zinc-500 uppercase tracking-wide">{label}</p>
      )}
      <div className="flex items-center">
        <span
          className={`${textSize} text-gray-700 dark:text-zinc-300 font-mono break-all ${className}`}
          title={value}
        >
          {displayValue}
        </span>

        {/* Copy button */}
        {showCopy && (
          <button
            onClick={handleCopy}
            className="p-0.5 ml-1 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors shrink-0"
            title={copied ? 'Copied!' : copyFailed ? 'Copy failed' : 'Copy to clipboard'}
            type="button"
          >
            {copyFailed ? (
              <svg
                className="w-3.5 h-3.5 text-red-500 dark:text-red-400"
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
            ) : copied ? (
              <svg
                className="w-3.5 h-3.5 text-green-500 dark:text-green-400"
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
            ) : (
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            )}
          </button>
        )}

        {/* Explorer link */}
        {showExplorer && (
          <a
            href={getExplorerUrl(value, explorerType, chainId)}
            target="_blank"
            rel="noopener noreferrer"
            className="p-0.5 text-gray-400 dark:text-zinc-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors shrink-0"
            title="View in Explorer"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
