/**
 * HeaderNetValue
 * Compact Net Value display for Header
 * Shows total portfolio value and 24h change percentage
 * Hidden on mobile (md:flex), null when disconnected
 */

import { useWallet, useZkLogin } from '@nasun/wallet';
import { useNetWorth } from '../../features/dashboard/hooks/useNetWorth';

export function HeaderNetValue() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = isZkLoggedIn || (status === 'unlocked' && account);

  const { totalUsdValue, changePercent, isLoading } = useNetWorth();

  // Don't render if not connected
  if (!isConnected) return null;

  // Loading state
  if (isLoading) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-theme-bg-secondary rounded-lg">
        <div className="w-16 h-4 bg-theme-bg-tertiary rounded animate-pulse" />
      </div>
    );
  }

  // Format USD value
  const formattedValue = totalUsdValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Determine change color
  const changeColor =
    changePercent > 0
      ? 'text-green-500 dark:text-green-400'
      : changePercent < 0
        ? 'text-red-500 dark:text-red-400'
        : 'text-theme-text-muted';

  // Format change with sign
  const formattedChange =
    changePercent > 0
      ? `+${changePercent.toFixed(1)}%`
      : `${changePercent.toFixed(1)}%`;

  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-theme-bg-secondary rounded-lg">
      <span className="text-sm font-medium text-theme-text-primary">
        ${formattedValue}
      </span>
      <span className={`text-xs font-medium ${changeColor}`}>
        {formattedChange}
      </span>
    </div>
  );
}
