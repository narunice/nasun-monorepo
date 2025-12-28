import { useMarket } from '../context/MarketContext';

export function PoolInfo() {
  const { currentPool } = useMarket();
  return (
    <div className="mt-6 pt-4 border-t border-theme-border">
      <h4 className="text-sm font-medium text-theme-text-secondary mb-2">Pool Info</h4>
      <div className="text-xs space-y-1">
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
