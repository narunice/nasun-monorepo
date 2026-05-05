/**
 * PredictPage
 * Prediction Market listing page
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMarkets, MarketCard, usePredictionAdmin } from '../features/prediction';
import { usePredictionFilters } from '../features/prediction/hooks/usePredictionFilters';
import { usePredictionPositions } from '../features/prediction/hooks/usePredictionPositions';
import { MarketFilterBar } from '../features/prediction/components/MarketFilterBar';
import { SkeletonCard } from '../components/common';
import { PredictHero } from '../features/prediction/components/hero/PredictHero';

export function PredictPage() {
  const { markets, isLoading, error } = useMarkets();
  const { isResolver } = usePredictionAdmin();
  const { positions: myPositions } = usePredictionPositions();

  const marketRecords = useMemo(() => markets.map((m) => m.market), [markets]);
  const myMarketIds = useMemo(
    () => new Set(myPositions.map((p) => p.marketId)),
    [myPositions],
  );
  const {
    filtered,
    category,
    sortBy,
    status,
    setCategory,
    setSortBy,
    setStatus,
  } = usePredictionFilters(marketRecords, myMarketIds);
  const filteredEntries = useMemo(() => {
    const filteredIds = new Set(filtered.map((m) => m.id));
    const order = new Map(filtered.map((m, i) => [m.id, i]));
    return markets
      .filter(({ market }) => filteredIds.has(market.id))
      .sort((a, b) => (order.get(a.market.id) ?? 0) - (order.get(b.market.id) ?? 0));
  }, [markets, filtered]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-56 bg-theme-bg-tertiary rounded animate-pulse" />
          <div className="h-4 w-72 bg-theme-bg-tertiary rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={3} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Failed to load markets</p>
        <p className="text-sm text-theme-text-muted mt-2">
          {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-theme-text-primary">
            Prediction Markets
          </h1>
          <p className="text-sm text-theme-text-muted mt-1">
            Trade on the outcome of real-world events
          </p>
        </div>
        {isResolver && (
          <Link
            to="/predict/admin"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-colors w-full sm:w-auto"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create Market
          </Link>
        )}
      </div>

      {/* Hero Section */}
      <PredictHero markets={markets} myPositionCount={myPositions.length} />

      {/* Filters */}
      {markets.length > 0 && (
        <MarketFilterBar
          status={status}
          category={category}
          sortBy={sortBy}
          setStatus={setStatus}
          setCategory={setCategory}
          setSortBy={setSortBy}
        />
      )}

      {/* Market Grid */}
      {markets.length === 0 ? (
        <div className="text-center py-12 bg-theme-bg-secondary rounded-xl">
          <p className="text-theme-text-muted">No open markets yet. Check back soon.</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="text-center py-12 bg-theme-bg-secondary rounded-xl">
          <p className="text-theme-text-muted">No markets match your filters.</p>
        </div>
      ) : (
        <div
          data-tour="prediction-market-list"
          className="-mx-3 sm:mx-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
        >
          {filteredEntries.map(({ market, yesOrderbook }) => (
            <MarketCard key={market.id} market={market} yesOrderbook={yesOrderbook} />
          ))}
        </div>
      )}

    </div>
  );
}
