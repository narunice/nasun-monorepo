import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Shared copy-to-clipboard logic.
 * Returns { copied, handleCopy } for use in any component with a copy button.
 */
export function useCopyToClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), resetMs);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [resetMs]);

  return { copied, handleCopy };
}
