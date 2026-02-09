/**
 * MobileAssetBar
 * Compact single-line portfolio value display for mobile.
 * Shows: $12,345 +$123 (+1.2%)
 * Benchmarked from Coinbase App mobile hero.
 */

import { useWallet, useZkLogin } from '@nasun/wallet';
import { useTotalValue } from '../../portfolio/hooks';

export function MobileAssetBar() {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { totalValue, totalPnl24h, totalChange24h, isLoading } = useTotalValue();

  const isConnected = status === 'unlocked' || isZkConnected;
  const isPositive = totalChange24h >= 0;
  const changeColor = totalChange24h === 0
    ? 'text-theme-text-secondary'
    : isPositive ? 'text-green-400' : 'text-red-400';

  if (!isConnected) {
    return (
      <div className="flex items-center gap-3 px-1 py-2">
        <span className="text-xl font-bold text-theme-text-muted">--</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <span className="text-xl font-bold text-theme-text-primary">
        {isLoading ? '...' : `$${totalValue.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`}
      </span>
      {!isLoading && totalValue > 0 && (
        <span className={`text-xs font-medium ${changeColor}`}>
          {isPositive ? '+' : '-'}${Math.abs(totalPnl24h).toLocaleString('en-US', {
            maximumFractionDigits: 2,
          })}
          {' '}({isPositive ? '+' : ''}{totalChange24h.toFixed(2)}%)
        </span>
      )}
    </div>
  );
}
