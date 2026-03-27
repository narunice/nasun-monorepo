import { useMyScratchCards } from '../hooks';
import { formatNusdc, getTierColorClass } from '../types';

export function MyScratchCardList() {
  const { cards, isLoading } = useMyScratchCards();

  if (isLoading) {
    return (
      <div className="text-sm text-theme-text-muted">Loading cards...</div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="text-sm text-theme-text-muted">
        No winning cards yet. Buy a scratch card to get started!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-theme-text-primary">
        My Winning Cards
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
        {cards.map((card) => (
          <div
            key={card.id}
            className="bg-theme-bg-tertiary rounded-lg p-3 border border-theme-border"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs text-theme-text-muted">
                #{card.cardId}
              </span>
              <span
                className={`text-sm font-bold ${getTierColorClass(card.multiplier)}`}
              >
                {card.multiplier}x
              </span>
            </div>
            <div className="text-lg font-bold text-theme-accent mt-1">
              {formatNusdc(card.prizeAmount)} NUSDC
            </div>
            <div className="text-xs text-theme-text-muted mt-1">
              {new Date(card.purchaseTime).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
