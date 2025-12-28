/**
 * PredictPage
 * Prediction Market listing page
 */

import { useMarkets, MarketCard } from '../features/prediction';
import { Spinner } from '../components/common';

export function PredictPage() {
  const { markets, isLoading, error } = useMarkets();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Failed to load markets</p>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
          {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Prediction Markets
          </h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
            Trade on the outcome of real-world events
          </p>
        </div>
      </div>

      {/* Market Grid */}
      {markets.length === 0 ? (
        <div className="text-center py-12 bg-gray-100 dark:bg-zinc-800 rounded-xl">
          <p className="text-gray-500 dark:text-zinc-400">
            No markets available yet
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}
