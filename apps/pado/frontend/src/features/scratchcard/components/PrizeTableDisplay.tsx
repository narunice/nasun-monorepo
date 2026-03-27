import { PRIZE_TIERS, CARD_PRICE_DISPLAY } from '../constants';

export function PrizeTableDisplay() {
  // Skip the "Lose" tier (index 0)
  const winTiers = PRIZE_TIERS.filter((t) => t.multiplier > 0);

  return (
    <div className="bg-theme-bg-secondary rounded-xl p-6">
      <h2 className="text-lg font-semibold text-theme-text-primary mb-4">
        Prize Table
      </h2>
      <div className="space-y-2">
        {winTiers.map((tier) => (
          <div
            key={tier.multiplier}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-theme-bg-tertiary"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-theme-text-primary">
                {tier.label}
              </span>
              {tier.multiplier >= 50 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                  RARE
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-theme-text-muted tabular-nums">
                {tier.probability}
              </span>
              <span className="font-semibold text-theme-accent tabular-nums">
                {CARD_PRICE_DISPLAY * tier.multiplier} NUSDC
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-theme-text-muted mt-3">
        RTP 76.5% -- Each card costs {CARD_PRICE_DISPLAY} NUSDC
      </p>
    </div>
  );
}
