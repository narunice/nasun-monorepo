import { useMemo } from 'react';
import type { MarketWithOrderbook } from '../../hooks/useMarkets';
import { HeroStatsRow } from './HeroStatsRow';
import { FeaturedMarketStrip } from './FeaturedMarketStrip';

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

    const hasVolume = openMarkets.some(({ market }) => market.totalVolume > 0n);

    const sorted = hasVolume
      ? [...openMarkets].sort((a, b) =>
          b.market.totalVolume > a.market.totalVolume ? 1 : -1,
        )
      : [...openMarkets].sort(
          (a, b) => a.market.closeTime - b.market.closeTime,
        );

    // Pick up to 3, preferring category diversity
    const result: MarketWithOrderbook[] = [];
    const usedCategories = new Set<string>();

    for (const entry of sorted) {
      if (result.length >= 3) break;
      if (!usedCategories.has(entry.market.category)) {
        result.push(entry);
        usedCategories.add(entry.market.category);
      }
    }
    // Fill remaining slots if diversity couldn't reach 3
    const addedIds = new Set(result.map((r) => r.market.id));
    for (const entry of sorted) {
      if (result.length >= 3) break;
      if (!addedIds.has(entry.market.id)) result.push(entry);
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
      <FeaturedMarketStrip featured={featured} />
    </div>
  );
}
