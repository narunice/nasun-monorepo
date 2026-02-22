/**
 * FavoriteStrip
 * Horizontal quick-switch strip for favorited markets.
 * Click a chip to switch markets instantly.
 */

import { useMarket, type MarketKey } from '../context/MarketContext';
import { useFavoriteMarkets } from '../hooks/useFavoriteMarkets';
import { TokenIcon } from '@/components/common';

export function FavoriteStrip() {
  const { currentMarket, setMarket, markets } = useMarket();
  const { favorites } = useFavoriteMarkets();

  // Only show markets that are in favorites and have deployed pools
  const favoriteMarkets = markets.filter(m => favorites.includes(m.key));

  if (favoriteMarkets.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-1 h-7">
        <span className="text-xs text-theme-text-muted/50">
          Star markets in the selector to pin them here
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
      {favoriteMarkets.map(market => {
        const isActive = market.key === currentMarket;
        return (
          <button
            key={market.key}
            onClick={() => setMarket(market.key as MarketKey)}
            aria-current={isActive ? 'true' : undefined}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              isActive
                ? 'bg-pd1/20 text-pd1 dark:text-pd3'
                : 'bg-theme-bg-tertiary/60 text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary'
            }`}
          >
            <div className="flex -space-x-1.5">
              <TokenIcon symbol={market.pool.baseToken.symbol} className="relative z-10 border-2 border-theme-bg-primary" />
              <TokenIcon symbol={market.pool.quoteToken.symbol} className="border-2 border-theme-bg-primary" />
            </div>
            <span>{market.label}</span>
          </button>
        );
      })}
    </div>
  );
}
