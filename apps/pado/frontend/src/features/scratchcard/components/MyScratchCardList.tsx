import { useState } from 'react';
import { useMyScratchCards } from '../hooks';
import { formatNusdc, getTierColorClass } from '../types';

const PAGE_SIZE = 6;

export function MyWinningCards() {
  const { purchases, isLoading } = useMyScratchCards();
  const wins = purchases.filter((p) => p.isWinner);

  if (isLoading) {
    return <div className="text-sm text-theme-text-muted">Loading...</div>;
  }

  if (wins.length === 0) {
    return (
      <div className="text-sm text-theme-text-muted">
        No wins yet. Keep trying!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {wins.map((w) => (
        <div
          key={w.cardId}
          className="bg-theme-bg-tertiary rounded-lg p-3 border border-theme-accent/30"
        >
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] text-theme-text-muted">#{w.cardId}</span>
            <span className={`text-sm font-bold ${getTierColorClass(w.multiplier)}`}>
              {w.multiplier}x
            </span>
          </div>
          <div className="text-sm font-semibold text-theme-accent">
            +{formatNusdc(w.prizeAmount)} NUSDC
          </div>
          {w.timestampMs ? (
            <div className="text-[10px] text-theme-text-muted mt-1">
              {new Date(w.timestampMs).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function MyPurchaseHistory() {
  const { purchases, isLoading } = useMyScratchCards();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (isLoading) {
    return <div className="text-sm text-theme-text-muted">Loading...</div>;
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
  const wins = purchases.filter((p) => p.isWinner).length;

  return (
    <div className="space-y-3">
      <span className="text-xs text-theme-text-muted">
        {wins} wins / {purchases.length} total
      </span>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
        {visible.map((p) => (
          <div
            key={p.cardId}
            className={`rounded-md px-2 py-1.5 text-center ${
              p.isWinner
                ? 'bg-theme-bg-tertiary border border-theme-accent/20'
                : 'bg-theme-bg-secondary border border-theme-border/50 opacity-50'
            }`}
          >
            <div className="text-[10px] text-theme-text-muted">#{p.cardId}</div>
            {p.isWinner ? (
              <div className={`text-xs font-bold ${getTierColorClass(p.multiplier)}`}>
                {p.multiplier}x
              </div>
            ) : (
              <div className="text-[10px] text-theme-text-muted">miss</div>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full py-1.5 text-xs font-medium text-pd3 hover:text-pd4 transition-colors"
        >
          Show More ({purchases.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

/** @deprecated Use MyWinningCards and MyPurchaseHistory separately */
export function MyScratchCardList() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-theme-text-primary mb-3">
          My Winning Cards
        </h3>
        <MyWinningCards />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-theme-text-primary mb-3">
          Purchase History
        </h3>
        <MyPurchaseHistory />
      </div>
    </div>
  );
}
