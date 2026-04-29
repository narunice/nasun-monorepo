/**
 * PoolStatusBar - Shows Number Match pool status
 */
import type { FC } from 'react';
import { useNumberMatchPool } from '../hooks/useNumberMatchPool';
import { formatNusdc } from '../types';

export const PoolStatusBar: FC = () => {
  const { pool, isLoading } = useNumberMatchPool();

  if (isLoading || !pool) {
    return (
      <div className="bg-theme-surface rounded-xl border border-theme-border p-4 animate-pulse">
        <div className="h-4 bg-theme-surface-secondary rounded w-3/4" />
      </div>
    );
  }

  return (
    <div className="bg-theme-surface rounded-xl border border-theme-border p-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-theme-text-muted">Pool: </span>
          <span className="font-mono text-theme-text">{formatNusdc(pool.poolBalance)} NUSDC</span>
        </div>
        <div>
          <span className="text-theme-text-muted">Today: </span>
          <span className="font-mono text-theme-text">{pool.dailyPlayCount.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-theme-text-muted">Total Plays: </span>
          <span className="font-mono text-theme-text">{pool.totalPlays.toLocaleString()}</span>
        </div>
        <div>
          <span className="text-theme-text-muted">Total Prizes: </span>
          <span className="font-mono text-theme-text">{formatNusdc(pool.totalPrizesPaid)} NUSDC</span>
        </div>
        {pool.isPaused && (
          <div className="text-yellow-400 font-medium">PAUSED</div>
        )}
      </div>
    </div>
  );
};
