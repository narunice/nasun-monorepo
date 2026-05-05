import type { MarketWithOrderbook } from '../../hooks/useMarkets';
import { FeaturedMarketCard } from './FeaturedMarketCard';

interface FeaturedMarketStripProps {
  featured: MarketWithOrderbook[];
}

export function FeaturedMarketStrip({ featured }: FeaturedMarketStripProps) {
  if (featured.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide -mx-3 px-3 sm:mx-0 sm:px-0">
      {featured.map(({ market, yesOrderbook }) => (
        <FeaturedMarketCard
          key={market.id}
          market={market}
          yesOrderbook={yesOrderbook}
        />
      ))}
    </div>
  );
}
