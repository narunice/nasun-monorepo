import { useMarket } from '../context/MarketContext';

export function PoolInfo() {
  const { currentPool } = useMarket();
  return (
    <div className="mt-6 pt-4 border-t border-gray-700">
      <h4 className="text-sm font-medium text-gray-400 mb-2">Pool Info</h4>
      <div className="text-xs space-y-1 text-gray-500">
        <div className="flex justify-between">
          <span>Tick Size:</span>
          <span>${(currentPool.tickSize / Math.pow(10, currentPool.quoteToken.decimals)).toFixed(4)}</span>
        </div>
        <div className="flex justify-between">
          <span>Lot Size:</span>
          <span>{(currentPool.lotSize / Math.pow(10, currentPool.baseToken.decimals)).toFixed(6)} {currentPool.baseToken.symbol}</span>
        </div>
        <div className="flex justify-between">
          <span>Maker Fee:</span>
          <span>0.05%</span>
        </div>
        <div className="flex justify-between">
          <span>Taker Fee:</span>
          <span>0.1%</span>
        </div>
      </div>
    </div>
  );
}
