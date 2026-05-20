import { useMemo } from 'react';
import type { MarketWithOrderbook } from '../../hooks/useMarkets';
import { HeroStatsRow } from './HeroStatsRow';
import { FeaturedMarketCarousel } from './FeaturedMarketCarousel';
import { PadoFeedCarousel } from './PadoFeedCarousel';
import { MarketRailPanel } from './MarketRailPanel';

interface PredictHeroProps {
  markets: MarketWithOrderbook[];
  myPositionCount: number;
}

export function PredictHero({ markets, myPositionCount }: PredictHeroProps) {
  const openMarkets = useMemo(
    () => markets.filter(({ market }) => market.status === 'open'),
    [markets],
  );

  const totalVolumeRaw = useMemo(
    () => openMarkets.reduce((sum, { market }) => sum + market.totalVolume, 0n),
    [openMarkets],
  );

  const featured = useMemo(() => {
    if (openMarkets.length === 0) return [];

    const SLOTS = 5;

    // Bucket by category; within each bucket, sort by volume desc so the
    // top pick from any category is its most-active market. Falls back to
    // closeTime asc when no market has volume yet.
    const hasVolume = openMarkets.some(({ market }) => market.totalVolume > 0n);
    const sortFn = hasVolume
      ? (a: MarketWithOrderbook, b: MarketWithOrderbook) =>
          b.market.totalVolume > a.market.totalVolume ? 1 : -1
      : (a: MarketWithOrderbook, b: MarketWithOrderbook) =>
          a.market.closeTime - b.market.closeTime;

    const byCategory = new Map<string, MarketWithOrderbook[]>();
    for (const entry of openMarkets) {
      const cat = entry.market.category;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(entry);
    }
    for (const list of byCategory.values()) list.sort(sortFn);

    // Category order: most-active category first (by its top market's
    // volume) so the first carousel slide is still the headliner.
    const categories = [...byCategory.keys()].sort((a, b) => {
      const va = byCategory.get(a)![0].market.totalVolume;
      const vb = byCategory.get(b)![0].market.totalVolume;
      return vb > va ? 1 : -1;
    });

    // Round-robin: pass 0 takes the top market from each category, pass 1
    // takes #2, etc. Guarantees every category appears before any
    // category gets a second slot.
    const result: MarketWithOrderbook[] = [];
    for (let pass = 0; result.length < SLOTS; pass++) {
      let addedThisPass = false;
      for (const cat of categories) {
        if (result.length >= SLOTS) break;
        const list = byCategory.get(cat)!;
        if (pass < list.length) {
          result.push(list[pass]);
          addedThisPass = true;
        }
      }
      if (!addedThisPass) break;
    }

    return result;
  }, [openMarkets]);

  if (openMarkets.length === 0) return null;

  return (
    <div className="mb-2">
      <HeroStatsRow
        openMarketsCount={openMarkets.length}
        totalVolumeRaw={totalVolumeRaw}
        myPositionCount={myPositionCount}
      />
      <div className="flex gap-4 h-[420px]">
        <div className="flex-1 min-w-0 h-full">
          <FeaturedMarketCarousel featured={featured} />
        </div>
        <div className="hidden lg:flex w-1/3 shrink-0 h-full">
          <PadoFeedCarousel fallback={<MarketRailPanel markets={markets} />} />
        </div>
      </div>
    </div>
  );
}
