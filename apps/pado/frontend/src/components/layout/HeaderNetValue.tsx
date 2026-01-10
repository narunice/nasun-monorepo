/**
 * HeaderNetValue
 * Compact Net Value display for Header
 * Shows total portfolio value and 24h change percentage
 * Hidden on mobile (md:flex), null when disconnected
 *
 * Uses useUnifiedBalance for consistent pricing across the app.
 *
 * @version 2.0.0 (Phase 16.1)
 */

import { useWallet, useZkLogin } from '@nasun/wallet';
import { useUnifiedBalance } from '../../features/core/unified-margin';
import { formatUsdValue, formatPercentage } from '../../lib/prices';

export function HeaderNetValue() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = isZkLoggedIn || (status === 'unlocked' && account);

  const { totalValue, totalChange24h, isLoading } = useUnifiedBalance();

  // Don't render if not connected
  if (!isConnected) return null;

  // Loading state - show skeleton
  if (isLoading) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-theme-bg-secondary rounded-lg">
        <div className="w-16 h-4 bg-theme-bg-tertiary rounded animate-pulse" />
      </div>
    );
  }

  // Determine change color
  const changeColor =
    totalChange24h > 0
      ? 'text-green-500 dark:text-green-400'
      : totalChange24h < 0
        ? 'text-red-500 dark:text-red-400'
        : 'text-theme-text-muted';

  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-theme-bg-secondary rounded-lg">
      <span className="text-sm font-medium text-theme-text-primary">
        {formatUsdValue(totalValue)}
      </span>
      <span className={`text-xs font-medium ${changeColor}`}>
        {formatPercentage(totalChange24h)}
      </span>
    </div>
  );
}
