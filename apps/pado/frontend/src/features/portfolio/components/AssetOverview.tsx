/**
 * AssetOverview Component
 * Display total portfolio value in USD
 */

import { useWallet } from '@nasun/wallet';
import { useTotalValue } from '../hooks';

export function AssetOverview() {
  const { status } = useWallet();
  const { totalValue, totalPnl24h, totalChange24h, isLoading } = useTotalValue();

  const isConnected = status === 'unlocked';
  const isPositive = totalChange24h >= 0;
  const changeColor = totalChange24h === 0 ? 'text-theme-text-secondary' : isPositive ? 'text-green-400' : 'text-red-400';

  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <div className="text-sm text-theme-text-secondary">Total Asset Value</div>
        <div className="text-3xl font-bold mt-2 text-theme-text-muted">--</div>
        <div className="text-sm text-theme-text-muted mt-2">
          Connect wallet to view your portfolio
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary rounded-lg p-6">
      <div className="text-sm text-theme-text-secondary">Total Asset Value</div>
      <div className="text-3xl font-bold mt-2">
        {isLoading ? (
          <span className="text-theme-text-muted">Loading...</span>
        ) : (
          `$${totalValue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        )}
      </div>
      {!isLoading && totalValue > 0 && (
        <div className={`flex items-center gap-2 mt-2 ${changeColor}`}>
          <span className="text-sm">
            {isPositive ? '+' : ''}{totalChange24h.toFixed(2)}% (24h)
          </span>
          <span className="text-sm">
            {isPositive ? '+' : ''}${Math.abs(totalPnl24h).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      )}
    </div>
  );
}
