import { useMarket } from '../context/MarketContext';

interface PoolInfoProps {
  variant?: 'card' | 'inline';
}

export function PoolInfo({ variant = 'card' }: PoolInfoProps) {
  const { currentPool } = useMarket();

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
          <span className="text-theme-text-primary">${(currentPool.tickSize / Math.pow(10, currentPool.quoteToken.decimals)).toFixed(4)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Lot Size:</span>
          <span className="text-theme-text-primary">{(currentPool.lotSize / Math.pow(10, currentPool.baseToken.decimals)).toFixed(6)} {currentPool.baseToken.symbol}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Maker Fee:</span>
          <span className="text-theme-text-primary">0.05%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Taker Fee:</span>
          <span className="text-theme-text-primary">0.1%</span>
        </div>
      </div>
    </div>
  );
}
