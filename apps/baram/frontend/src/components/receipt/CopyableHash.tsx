/**
 * CopyableHash - Clickable hash display with copy-to-clipboard
 */

import { useState, useCallback } from 'react';
import { truncateHash } from '@/utils/format';

interface CopyableHashProps {
  hash: string;
  label: string;
  chars?: number;
}

export function CopyableHash({ hash, label, chars }: CopyableHashProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g., non-HTTPS context)
    }
  }, [hash]);

  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <button
        onClick={handleCopy}
        className="font-mono text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
        title={hash || 'No data'}
      >
        {copied ? 'Copied!' : truncateHash(hash, chars)}
      </button>
    </div>
  );
}
