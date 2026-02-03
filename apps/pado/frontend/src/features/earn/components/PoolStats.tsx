/**
 * PoolStats Component
 * Displays lending pool statistics (TVL, APY, Utilization)
 */

import { useLendingPool } from '../hooks/useLendingPool';
import { formatNUSDC, formatPercentage } from '../types/lending';

export function PoolStats() {
  const { pool, stats, isLoading } = useLendingPool();

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-theme-bg-tertiary rounded w-24" />
          <div className="h-8 bg-theme-bg-tertiary rounded w-32" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-16 bg-theme-bg-tertiary rounded" />
            <div className="h-16 bg-theme-bg-tertiary rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!pool || !stats) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <p className="text-sm text-theme-text-muted">Failed to load pool data</p>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      <h3 className="text-sm font-medium text-theme-text-secondary mb-4">
        NUSDC Lending Pool
      </h3>

      {/* Total Deposits (TVL) */}
      <div className="mb-4">
        <p className="text-xs text-theme-text-muted">Total Deposits</p>
        <p className="text-2xl font-bold text-theme-text-primary mt-1">
          ${formatNUSDC(pool.totalDeposits)}
          <span className="text-sm font-normal text-theme-text-muted ml-1">NUSDC</span>
        </p>
      </div>

      {/* APY & Utilization */}
      <div className="grid grid-cols-2 gap-4">
        {/* Supply APY */}
        <div className="bg-theme-bg-secondary/50 rounded-lg p-3">
          <p className="text-xs text-theme-text-muted">Supply APY</p>
          <p className="text-lg font-semibold text-green-600 dark:text-green-400 mt-1">
            {formatPercentage(stats.supplyAPY)}
          </p>
        </div>

        {/* Utilization */}
        <div className="bg-theme-bg-secondary/50 rounded-lg p-3">
          <p className="text-xs text-theme-text-muted">Utilization</p>
          <p className="text-lg font-semibold text-theme-text-primary mt-1">
            {formatPercentage(stats.utilizationRate)}
          </p>
        </div>
      </div>

      {/* Available Liquidity */}
      <div className="mt-4 pt-4 border-t border-theme-border">
        <div className="flex justify-between text-sm">
          <span className="text-theme-text-muted">Available</span>
          <span className="text-theme-text-primary font-medium">
            ${formatNUSDC(stats.availableLiquidity)} NUSDC
          </span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-theme-text-muted">Borrow APR</span>
          <span className="text-orange-500 font-medium">
            {formatPercentage(stats.borrowAPR)}
          </span>
        </div>
      </div>
    </div>
  );
}
