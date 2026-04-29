import { useScratchCardPool } from '../hooks';
import { formatNusdc } from '../types';
import { MAX_DAILY_CARDS } from '../constants';

export function PoolStatusBar() {
  const { pool, isLoading } = useScratchCardPool();

  if (isLoading || !pool) {
    return (
      <div className="flex items-center justify-between bg-theme-bg-secondary rounded-xl px-6 py-3 animate-pulse">
        <div className="h-5 w-32 bg-theme-bg-tertiary rounded" />
        <div className="h-5 w-24 bg-theme-bg-tertiary rounded" />
      </div>
    );
  }

  const remaining = MAX_DAILY_CARDS - pool.dailyCardCount;

  return (
    <div className="flex items-center justify-between bg-theme-bg-secondary rounded-xl px-4 sm:px-6 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-theme-text-muted">Prize Pool</span>
        <span className="text-lg font-semibold text-theme-accent">
          {formatNusdc(pool.poolBalance)} NUSDC
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-theme-text-muted">
          {pool.totalCardsSold.toLocaleString()} sold
        </span>
        {pool.isPaused && (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">
            Paused
          </span>
        )}
        {!pool.isPaused && remaining <= 100 && (
          <span className="text-xs text-yellow-600 dark:text-yellow-400">
            {remaining} cards left today
          </span>
        )}
      </div>
    </div>
  );
}
