/**
 * PredictPage
 * Prediction Market listing page
 */

import { Link } from 'react-router-dom';
import { useMarkets, MarketCard, usePredictionAdmin } from '../features/prediction';
import { Spinner } from '../components/common';

export function PredictPage() {
  const { markets, isLoading, error } = useMarkets();
  const { isResolver } = usePredictionAdmin();

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

      {/* Market Grid */}
      {markets.length === 0 ? (
        <div className="text-center py-12 bg-theme-bg-secondary rounded-xl">
          <p className="text-theme-text-muted">
            No markets available yet
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map(({ market, yesOrderbook }) => (
            <MarketCard key={market.id} market={market} yesOrderbook={yesOrderbook} />
          ))}
        </div>
      )}
    </div>
  );
}
