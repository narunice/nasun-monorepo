/**
 * MobileMarketHeader
 * Sticky header for mobile trading page showing current market and price.
 * Always visible during scroll so users never lose price context.
 */

interface MobileMarketHeaderProps {
  symbol: string;
  price: number;
  priceChange24h?: number;
}

export function MobileMarketHeader({ symbol, price, priceChange24h }: MobileMarketHeaderProps) {
  const changeColor = priceChange24h == null
    ? 'text-theme-text-muted'
    : priceChange24h >= 0
      ? 'text-green-500'
      : 'text-red-500';

  const changeText = priceChange24h != null
    ? `${priceChange24h >= 0 ? '+' : ''}${priceChange24h.toFixed(1)}%`
    : '';

  return (
    <div className="sticky top-0 z-20 bg-theme-bg-primary border-b border-theme-border px-3 py-2 flex items-center justify-between">
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
      </div>
    </div>
  );
}
