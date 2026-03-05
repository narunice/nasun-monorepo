/**
 * MobileMarketHeader
 * Sticky header for mobile trading page showing current market and price.
 * Always visible during scroll so users never lose price context.
 */

interface MobileMarketHeaderProps {
  symbol: string;
  price: number;
  priceChange24h?: number;
  onExpandChart?: () => void;
}

export function MobileMarketHeader({ symbol, price, priceChange24h, onExpandChart }: MobileMarketHeaderProps) {
  const changeColor = priceChange24h == null
    ? 'text-theme-text-muted'
    : priceChange24h >= 0
      ? 'text-green-500'
      : 'text-red-500';

  const changeText = priceChange24h != null
    ? `${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(1)}%`
    : '';

  return (
    <div className="sticky top-0 z-20 bg-theme-bg-primary border-b border-theme-border px-3 py-3 flex items-center justify-between">
      <span className="text-sm font-semibold text-theme-text-primary">{symbol}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono font-semibold text-theme-text-primary">
          ${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </span>
        {changeText && (
          <span className={`text-xs font-mono font-medium ${changeColor}`}>
            {changeText}
          </span>
        )}
        {onExpandChart && (
          <button
            onClick={onExpandChart}
            className="p-3 -mr-1 text-theme-text-muted hover:text-theme-text-primary transition-colors"
            aria-label="Expand chart"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="10 2 14 2 14 6" />
              <polyline points="6 14 2 14 2 10" />
              <line x1="14" y1="2" x2="9.5" y2="6.5" />
              <line x1="2" y1="14" x2="6.5" y2="9.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
