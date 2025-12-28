/**
 * PredictMarketPage
 * Prediction Market detail page with orderbook and trading UI
 */

import { useParams, Link } from 'react-router-dom';
import { useMarket, MarketHeader, OutcomeOrderbook, generateSimulatedOrderbook, calculateProbability } from '../features/prediction';
import { Spinner } from '../components/common';

export function PredictMarketPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const { market, isLoading, error } = useMarket(marketId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">Failed to load market</p>
        <Link
          to="/predict"
          className="text-blue-500 hover:text-blue-400 underline"
        >
          Back to Markets
        </Link>
      </div>
    );
  }

  // Calculate probability for simulated orderbook
  const yesProbability = calculateProbability(market.yesSupply, market.noSupply);
  const yesBasePrice = yesProbability * 100; // Convert to basis points (50% -> 5000)
  const noBasePrice = (100 - yesProbability) * 100;

  // Generate simulated orderbooks
  const yesOrderbook = generateSimulatedOrderbook(yesBasePrice);
  const noOrderbook = generateSimulatedOrderbook(noBasePrice);

  const handlePriceClick = (isYes: boolean, price: number) => {
    console.log(`Clicked ${isYes ? 'YES' : 'NO'} price: ${price / 100}%`);
    // Will be used in Phase 14.4 for order form autofill
  };

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        to="/predict"
        className="inline-flex items-center gap-2 text-sm text-theme-text-secondary hover:text-theme-text-primary transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Markets
      </Link>

      {/* Market Header */}
      <MarketHeader market={market} />

      {/* Trading Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orderbook - 2 columns */}
        <div className="lg:col-span-2">
          <OutcomeOrderbook
            yesOrderbook={yesOrderbook}
            noOrderbook={noOrderbook}
            onPriceClick={handlePriceClick}
          />
        </div>

        {/* Order Form Placeholder - 1 column */}
        <div className="bg-theme-bg-secondary rounded-xl p-4">
          <h3 className="text-lg font-semibold text-theme-text-primary mb-4">
            Place Order
          </h3>
          <div className="text-center py-8 text-theme-text-muted">
            <p className="mb-2">Trading coming soon</p>
            <p className="text-sm">Phase 14.4</p>
          </div>
        </div>
      </div>

      {/* Market Info */}
      <div className="bg-theme-bg-secondary rounded-xl p-4">
        <h3 className="text-lg font-semibold text-theme-text-primary mb-4">
          Market Info
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-theme-text-muted">Market ID</div>
            <div className="font-mono text-theme-text-secondary truncate" title={market.id}>
              {market.id.slice(0, 8)}...{market.id.slice(-6)}
            </div>
          </div>
          <div>
            <div className="text-theme-text-muted">Creator</div>
            <div className="font-mono text-theme-text-secondary truncate" title={market.creator}>
              {market.creator.slice(0, 8)}...{market.creator.slice(-6)}
            </div>
          </div>
          <div>
            <div className="text-theme-text-muted">Close Time</div>
            <div className="text-theme-text-secondary">
              {new Date(market.closeTime).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
          <div>
            <div className="text-theme-text-muted">Status</div>
            <div className="text-theme-text-secondary capitalize">{market.status}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
