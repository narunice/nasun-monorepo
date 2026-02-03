/**
 * CopyableId Component
 * Displays ID/address with copy and explorer link buttons
 */

import { Link } from 'react-router-dom';
import { shortenId } from '../lib/nft';
import { useCopyToClipboard } from '../hooks';

interface CopyableIdProps {
  /** The full ID/address value */
  value: string;
  /** Optional label displayed above the value */
  label?: string;
  /** Number of characters to show on each side when shortened (0 = full display) */
  shorten?: number;
  /** Show copy button (default: true) */
  showCopy?: boolean;
  /** Show explorer link (default: false) */
  showLink?: boolean;
  /** Link path type */
  linkType?: 'address' | 'object' | 'tx';
  /** Text size */
  size?: 'xs' | 'sm';
  /** Additional className */
  className?: string;
}

/**
 * Get internal explorer link path
 */
function getLinkPath(value: string, type: 'address' | 'object' | 'tx'): string {
  switch (type) {
    case 'address':
      return `/address/${value}`;
    case 'object':
      return `/object/${value}`;
    case 'tx':
      return `/tx/${value}`;
    default:
      return `/object/${value}`;
  }
}

export default function CopyableId({
  value,
  label,
  shorten,
  showCopy = true,
  showLink = false,
  linkType = 'object',
  size = 'sm',
  className = '',
}: CopyableIdProps) {
  const { copied, handleCopy } = useCopyToClipboard(1500);

  const displayValue = shorten && shorten > 0 ? shortenId(value, shorten) : value;
  const textSize = size === 'xs' ? 'text-xs' : 'text-sm';

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      )}
      <div className="flex items-center">
        <span
          className={`${textSize} text-foreground font-mono break-all ${className}`}
          title={value}
        >
          {displayValue}
        </span>

        {/* Copy button */}
        {showCopy && (
          <button
            onClick={() => handleCopy(value)}
            className="p-0.5 ml-1 text-muted-foreground hover:text-primary transition-colors shrink-0"
            title={copied ? 'Copied!' : 'Copy to clipboard'}
            aria-label="Copy to clipboard"
            type="button"
          >
            {copied ? (
              <svg
                className="w-3.5 h-3.5 text-green-600 dark:text-green-400"
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
        {showLink && (
          <Link
            to={getLinkPath(value, linkType)}
            className="p-0.5 text-muted-foreground hover:text-primary transition-colors shrink-0"
            title="View details"
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
          </Link>
        )}
      </div>
    </div>
  );
}
