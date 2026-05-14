import { useCallback, useState } from 'react';
import { truncateHash } from '../../utils/format';

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
      // Clipboard API unavailable
    }
  }, [hash]);

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-uju-secondary/60">{label}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="font-mono text-xs text-uju-secondary hover:text-white transition-colors cursor-pointer"
        title={hash || 'No data'}
      >
        {copied ? 'Copied!' : truncateHash(hash, chars)}
      </button>
    </div>
  );
}
