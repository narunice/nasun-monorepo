/**
 * HashRef — on-chain object/address/tx reference with copy + explorer link.
 *
 * Renders the truncated value plus two icon buttons (copy, open-in-explorer)
 * inline. Use for any field that maps to a Nasun Explorer destination:
 * addresses, object IDs, transaction digests.
 *
 * For pure off-chain hex digests with no explorer page (input/output hash,
 * attestation hash) keep using `receipt/CopyableHash` instead.
 */

import { useCallback, useState } from 'react';
import { NETWORK_CONFIG } from '../services/network';
import { truncateAddress, truncateHash } from '../utils/format';

export type HashKind = 'object' | 'address' | 'tx';

interface HashRefProps {
  value: string | null | undefined;
  /** Explorer URL path segment. Defaults to 'object'. */
  kind?: HashKind;
  /** Override the visible label. When omitted, truncated form of `value` is shown. */
  display?: string;
  /** Number of chars to keep at each side when auto-truncating. */
  chars?: number;
  /** Hide the value text; only render the icon buttons. */
  iconsOnly?: boolean;
  /** Tailwind class applied to the value text. */
  valueClassName?: string;
  /** Tailwind class applied to the two icon buttons. */
  iconClassName?: string;
  /** Tailwind class applied to the outer container. */
  className?: string;
}

function explorerHref(kind: HashKind, value: string): string {
  const base = NETWORK_CONFIG.explorerUrl.replace(/\/$/, '');
  return `${base}/${kind}/${value}`;
}

function CopyIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function HashRef({
  value,
  kind = 'object',
  display,
  chars,
  iconsOnly = false,
  valueClassName = 'font-mono',
  iconClassName = 'text-uju-secondary/70 hover:text-white transition-colors p-0.5 -mx-0.5 rounded',
  className = 'inline-flex items-center gap-1.5 align-middle',
}: HashRefProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      // The component is occasionally embedded inside a clickable card
      // (e.g. agent list rows). Don't trigger the outer onClick when the
      // user is just trying to copy the address.
      e.stopPropagation();
      e.preventDefault();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Clipboard API unavailable; non-fatal.
      }
    },
    [value],
  );

  if (!value) {
    return <span className={valueClassName}>-</span>;
  }

  const text =
    display ??
    (kind === 'address' ? truncateAddress(value) : truncateHash(value, chars ?? 8));

  return (
    <span className={className}>
      {!iconsOnly && (
        <span className={valueClassName} title={value}>
          {text}
        </span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className={iconClassName}
        aria-label={`Copy ${kind}`}
        title={copied ? 'Copied!' : 'Copy to clipboard'}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <a
        href={explorerHref(kind, value)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={iconClassName}
        aria-label={`Open ${kind} in explorer`}
        title="Open in explorer"
      >
        <ExternalLinkIcon />
      </a>
    </span>
  );
}
