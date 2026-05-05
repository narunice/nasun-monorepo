import type { MarketWithOrderbook } from '../../hooks/useMarkets';
import { FeaturedMarketCard } from './FeaturedMarketCard';
import { useCarousel } from '../../../news/hooks/useCarousel';

interface FeaturedMarketCarouselProps {
  featured: MarketWithOrderbook[];
}

export function FeaturedMarketCarousel({ featured }: FeaturedMarketCarouselProps) {
  const { currentIndex, goTo, snapTo, setPaused, skipTransition } = useCarousel(featured.length, 7000);

  const slides = featured.length > 0 ? [...featured, featured[0]] : [];

  const handleTransitionEnd = (e: React.TransitionEvent) => {
    if (e.propertyName === 'transform' && currentIndex >= featured.length) snapTo(0);
  };

  const displayIndex = currentIndex >= featured.length ? 0 : currentIndex;

  if (featured.length === 0) return null;

  return (
    <div
      className="relative h-full overflow-hidden rounded-2xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className={`flex h-full ${skipTransition ? '' : 'transition-transform duration-500 ease-in-out'}`}
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        onTransitionEnd={handleTransitionEnd}
      >
        {slides.map(({ market, yesOrderbook, noOrderbook }, i) => (
          <div key={i < featured.length ? market.id : `${market.id}-clone`} className="w-full shrink-0 h-full">
            <FeaturedMarketCard market={market} yesOrderbook={yesOrderbook} noOrderbook={noOrderbook} />
          </div>
        ))}
      </div>

      {/* Dot navigation */}
      {featured.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {featured.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`rounded-full transition-all duration-300 ${
                i === displayIndex
                  ? 'w-5 h-2 bg-pd1 dark:bg-pd3'
                  : 'w-2 h-2 bg-theme-border hover:bg-theme-text-muted'
              }`}
              aria-label={`Go to market ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
