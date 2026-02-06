import { useMarket } from '../context/MarketContext';

interface PoolInfoProps {
  variant?: 'card' | 'inline' | 'header';
}

export function PoolInfo({ variant = 'card' }: PoolInfoProps) {
  const { currentPool } = useMarket();

  const tickSize = (currentPool.tickSize / Math.pow(10, currentPool.quoteToken.decimals)).toFixed(4);
  const lotSize = (currentPool.lotSize / Math.pow(10, currentPool.baseToken.decimals)).toFixed(6);
  const baseSymbol = currentPool.baseToken.symbol;
  const makerFee = (currentPool.makerFeeBps / 100).toFixed(2);
  const takerFee = (currentPool.takerFeeBps / 100).toFixed(2);

  // Header box: full-height card with 4 info rows, aligned with Interface + Toggles column
  if (variant === 'header') {
    return (
      <div className="bg-theme-bg-secondary rounded-lg px-4 py-3 h-full flex flex-col justify-between">
        <div className="flex justify-between">
          <span className="text-[10px] xl:text-xs text-theme-text-muted">Tick Size</span>
          <span className="text-[10px] xl:text-xs text-theme-text-primary font-mono">${tickSize}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] xl:text-xs text-theme-text-muted">Lot Size</span>
          <span className="text-[10px] xl:text-xs text-theme-text-primary font-mono">{lotSize} {baseSymbol}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] xl:text-xs text-theme-text-muted">Maker Fee</span>
          <span className="text-[10px] xl:text-xs text-theme-text-primary font-mono">{makerFee}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[10px] xl:text-xs text-theme-text-muted">Taker Fee</span>
          <span className="text-[10px] xl:text-xs text-theme-text-primary font-mono">{takerFee}%</span>
        </div>
      </div>
    );
  }

  // Card variant (with heading + border)
  const wrapperClass = variant === 'card'
    ? 'mt-6 pt-4 border-t border-theme-border'
    : '';

  return (
    <div className={wrapperClass}>
      {variant === 'card' && (
        <h4 className="text-sm xl:text-base font-medium text-theme-text-secondary mb-2">Pool Info</h4>
      )}
      <div className="text-xs xl:text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Tick Size:</span>
          <span className="text-theme-text-primary">${tickSize}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Lot Size:</span>
          <span className="text-theme-text-primary">{lotSize} {baseSymbol}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Maker Fee:</span>
          <span className="text-theme-text-primary">{makerFee}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Taker Fee:</span>
          <span className="text-theme-text-primary">{takerFee}%</span>
        </div>
      </div>
    </div>
  );
}
