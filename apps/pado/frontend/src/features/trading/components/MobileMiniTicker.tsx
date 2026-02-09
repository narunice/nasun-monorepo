/**
 * MobileMiniTicker Component
 * Compact price bar shown above mobile tab content to maintain price
 * context when switching between Chart/Book/Trade tabs.
 */

interface MobileMiniTickerProps {
  symbol: string;
  price: number;
  priceChange24h?: number;
}

export function MobileMiniTicker({ symbol, price, priceChange24h }: MobileMiniTickerProps) {
  const hasChange = priceChange24h != null;
  const isPositive = (priceChange24h ?? 0) >= 0;

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-theme-bg-secondary border-b border-theme-border">
      <span className="text-xs font-medium text-theme-text-primary">{symbol}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${isPositive ? 'text-trading-bid' : 'text-trading-ask'}`}>
          ${price > 0 ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
        </span>
        {hasChange && (
          <span className={`text-xs font-medium ${isPositive ? 'text-trading-bid' : 'text-trading-ask'}`}>
            {isPositive ? '+' : ''}{priceChange24h.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
}
