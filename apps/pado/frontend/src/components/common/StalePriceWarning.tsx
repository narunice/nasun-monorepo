/**
 * StalePriceWarning
 * Displays a small warning when the price source is not the live oracle.
 */

interface StalePriceWarningProps {
  source: 'oracle' | 'simulated' | 'unknown';
}

export function StalePriceWarning({ source }: StalePriceWarningProps) {
  if (source === 'oracle') return null;

  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
      title="Oracle unavailable. Price is estimated and may not reflect current market value."
    >
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01" />
      </svg>
      Simulated price
    </span>
  );
}
