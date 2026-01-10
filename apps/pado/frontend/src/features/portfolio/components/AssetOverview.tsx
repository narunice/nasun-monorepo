/**
 * AssetOverview Component
 * Display total asset value in USD with friendly messaging
 */

import { useWallet, useZkLogin } from '@nasun/wallet';
import { useTotalValue } from '../hooks';

export function AssetOverview() {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { totalValue, totalPnl24h, totalChange24h, isLoading } = useTotalValue();

  const isConnected = status === 'unlocked' || isZkConnected;
  const isPositive = totalChange24h >= 0;
  const changeColor = totalChange24h === 0 ? 'text-theme-text-secondary' : isPositive ? 'text-green-400' : 'text-red-400';

  // Format the 24h change in a friendly way
  const formatPnl = () => {
    const sign = isPositive ? '+' : '-';
    const amount = Math.abs(totalPnl24h).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `Today ${sign}$${amount}`;
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
          <span className="text-sm font-medium">{formatPnl()}</span>
        </div>
      )}
    </div>
  );
}
