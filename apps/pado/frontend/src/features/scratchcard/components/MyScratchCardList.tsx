import { useState } from 'react';
import { useMyScratchCards } from '../hooks';
import { formatNusdc, getTierColorClass, getTierLabel } from '../types';

const INITIAL_COUNT = 6;
const PAGE_SIZE = 6;

export function MyScratchCardList() {
  const { purchases, isLoading } = useMyScratchCards();
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

  if (isLoading) {
    return (
      <div className="text-sm text-theme-text-muted">Loading history...</div>
    );
  }

  if (purchases.length === 0) {
    return (
      <div className="text-sm text-theme-text-muted">
        No purchases yet. Buy a scratch card to get started!
      </div>
    );
  }

  const visible = purchases.slice(0, visibleCount);
  const hasMore = purchases.length > visibleCount;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-theme-text-primary">
          Purchase History
        </h3>
        <span className="text-xs text-theme-text-muted">
          {purchases.filter((p) => p.isWinner).length} wins / {purchases.length} total
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {visible.map((purchase) => (
          <div
            key={purchase.cardId}
            className={`rounded-lg p-3 border ${
              purchase.isWinner
                ? 'bg-theme-bg-tertiary border-theme-accent/30'
                : 'bg-theme-bg-secondary border-theme-border opacity-60'
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] text-theme-text-muted">
                #{purchase.cardId}
              </span>
              {purchase.isWinner ? (
                <span
                  className={`text-sm font-bold ${getTierColorClass(purchase.multiplier)}`}
                >
                  {purchase.multiplier}x
                </span>
              ) : (
                <span className="text-xs text-theme-text-muted">-</span>
              )}
            </div>
            {purchase.isWinner ? (
              <div className="text-sm font-semibold text-theme-accent">
                +{formatNusdc(purchase.prizeAmount)}
              </div>
            ) : (
              <div className="text-xs text-theme-text-muted">No Prize</div>
            )}
            {purchase.timestampMs ? (
              <div className="text-[10px] text-theme-text-muted mt-1">
                {new Date(purchase.timestampMs).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full py-2 text-sm font-medium text-pd3 hover:text-pd4 transition-colors"
        >
          Show More ({purchases.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}
