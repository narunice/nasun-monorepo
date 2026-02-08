/**
 * AssetOverview Component
 * Display total asset value in USD with 24h PnL and All Time PnL
 */

import { useWallet, useZkLogin } from '@nasun/wallet';
import { useTotalValue } from '../hooks';
import { useCostBasis } from '../hooks/useCostBasis';

export function AssetOverview() {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { totalValue, totalPnl24h, totalChange24h, isLoading } = useTotalValue();
  const { totalPnl, totalRealizedPnl, totalUnrealizedPnl, isLoading: isPnlLoading } = useCostBasis();

  const isConnected = status === 'unlocked' || isZkConnected;
  const isPositive = totalChange24h >= 0;
  const changeColor = totalChange24h === 0 ? 'text-theme-text-secondary' : isPositive ? 'text-green-400' : 'text-red-400';

  const allTimePnlColor = totalPnl === 0 ? 'text-theme-text-secondary' : totalPnl > 0 ? 'text-green-400' : 'text-red-400';

  // Format the 24h change in a friendly way
  const formatPnl24h = () => {
    const sign = isPositive ? '+' : '-';
    const amount = Math.abs(totalPnl24h).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `Today ${sign}$${amount}`;
  };

  const formatAllTimePnl = (value: number) => {
    const sign = value >= 0 ? '+' : '-';
    const amount = Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${sign}$${amount}`;
  };

  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <div className="text-sm text-theme-text-secondary">My Assets</div>
        <div className="text-3xl font-bold mt-2 text-theme-text-muted">--</div>
        <div className="text-sm text-theme-text-muted mt-2">
          Connect to see your balance
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary rounded-lg p-6">
      <div className="text-sm text-theme-text-secondary">My Assets</div>
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
        <div className={`mt-2 ${changeColor}`}>
          <span className="text-sm font-medium">{formatPnl24h()}</span>
        </div>
      )}
      {!isPnlLoading && (totalRealizedPnl !== 0 || totalUnrealizedPnl !== 0) && (
        <div className="mt-3 pt-3 border-t border-theme-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-theme-text-muted">All Time P&L</span>
            <span className={`text-sm font-semibold ${allTimePnlColor}`}>
              {formatAllTimePnl(totalPnl)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-theme-text-muted">Realized</span>
            <span className={`text-xs ${totalRealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatAllTimePnl(totalRealizedPnl)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] text-theme-text-muted">Unrealized</span>
            <span className={`text-xs ${totalUnrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatAllTimePnl(totalUnrealizedPnl)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
