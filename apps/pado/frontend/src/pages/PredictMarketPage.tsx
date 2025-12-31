/**
 * PredictMarketPage
 * Prediction Market detail page with orderbook and trading UI
 */

import { useParams, Link } from 'react-router-dom';
import { useState, useCallback, useMemo } from 'react';
import {
  useMarket,
  useMarketOrderbook,
  usePredictionPositions,
  usePredictionAdmin,
  MarketHeader,
  OutcomeOrderbook,
  OutcomeOrderForm,
  PositionList,
  AdminResolveModal,
  generateSimulatedOrderbook,
} from '../features/prediction';
import { Spinner } from '../components/common';

export function PredictMarketPage() {
  const { marketId } = useParams<{ marketId: string }>();
  const { market, isLoading, error, refetch: refetchMarket } = useMarket(marketId);
  const { yesOrderbook: realYesOrderbook, noOrderbook: realNoOrderbook, refetch: refetchOrderbook } = useMarketOrderbook(marketId);
  const { positions, refetch: refetchPositions } = usePredictionPositions(marketId);
  const { isResolver } = usePredictionAdmin();
  const [showResolveModal, setShowResolveModal] = useState(false);

  // Use real orderbook data, with simulated fallback for empty orderbooks
  // NOTE: All hooks must be called before any conditional returns
  const yesOrderbook = useMemo(() => {
    const hasRealData = realYesOrderbook.bids.length > 0 || realYesOrderbook.asks.length > 0;
    if (hasRealData) {
      // Use real data, optionally merge with simulated for visual depth
      const basePrice = realYesOrderbook.asks.length > 0
        ? realYesOrderbook.asks.sort((a, b) => a.price - b.price)[0].price
        : 5000;
      const simulated = generateSimulatedOrderbook(basePrice);
      return {
        bids: [...realYesOrderbook.bids, ...simulated.bids.filter(s =>
          !realYesOrderbook.bids.some(r => r.price === s.price)
        )].sort((a, b) => b.price - a.price).slice(0, 10),
        asks: [...realYesOrderbook.asks, ...simulated.asks.filter(s =>
          !realYesOrderbook.asks.some(r => r.price === s.price)
        )].sort((a, b) => a.price - b.price).slice(0, 10),
      };
    }
    // Fallback to pure simulation at 50%
    return generateSimulatedOrderbook(5000);
  }, [realYesOrderbook]);

  const noOrderbook = useMemo(() => {
    const hasRealData = realNoOrderbook.bids.length > 0 || realNoOrderbook.asks.length > 0;
    if (hasRealData) {
      const basePrice = realNoOrderbook.asks.length > 0
        ? realNoOrderbook.asks.sort((a, b) => a.price - b.price)[0].price
        : 5000;
      const simulated = generateSimulatedOrderbook(basePrice);
      return {
        bids: [...realNoOrderbook.bids, ...simulated.bids.filter(s =>
          !realNoOrderbook.bids.some(r => r.price === s.price)
        )].sort((a, b) => b.price - a.price).slice(0, 10),
        asks: [...realNoOrderbook.asks, ...simulated.asks.filter(s =>
          !realNoOrderbook.asks.some(r => r.price === s.price)
        )].sort((a, b) => a.price - b.price).slice(0, 10),
      };
    }
    return generateSimulatedOrderbook(5000);
  }, [realNoOrderbook]);

  // Refetch all data on trade success
  const handleRefetch = useCallback(() => {
    refetchMarket();
    refetchOrderbook();
    refetchPositions();
  }, [refetchMarket, refetchOrderbook, refetchPositions]);

  const handlePriceClick = useCallback((isYes: boolean, price: number) => {
    console.log(`Clicked ${isYes ? 'YES' : 'NO'} price: ${price / 100}%`);
    // TODO: Auto-fill order form with clicked price
  }, []);

  const handleTradeSuccess = useCallback((digest: string) => {
    console.log('Trade successful:', digest);
    handleRefetch();
  }, [handleRefetch]);

  // Conditional returns after all hooks
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
      <MarketHeader market={market} yesOrderbook={yesOrderbook} noOrderbook={noOrderbook} />

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

        {/* Order Form + Positions - 1 column */}
        <div className="space-y-4">
          <OutcomeOrderForm market={market} onSuccess={handleTradeSuccess} />
          <PositionList
            market={market}
            positions={positions}
            onSuccess={handleRefetch}
          />
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

      {/* Admin Section - Only for resolver */}
      {isResolver && market.status !== 'resolved' && (
        <div className="bg-theme-bg-secondary rounded-xl p-4 border border-yellow-500/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-theme-text-primary">
                Admin Actions
              </h3>
              <p className="text-sm text-theme-text-muted">
                You are the designated resolver for this market
              </p>
            </div>
            <button
              onClick={() => setShowResolveModal(true)}
              disabled={market.status === 'open' && Date.now() < market.closeTime}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {market.status === 'open' && Date.now() < market.closeTime
                ? 'Wait for Close Time'
                : 'Resolve Market'}
            </button>
          </div>
          {market.status === 'open' && Date.now() < market.closeTime && (
            <p className="text-xs text-yellow-500 mt-2">
              Market can be resolved after {new Date(market.closeTime).toLocaleString('en-US')}
            </p>
          )}
        </div>
      )}

      {/* Admin Resolve Modal */}
      <AdminResolveModal
        market={market}
        isOpen={showResolveModal}
        onClose={() => setShowResolveModal(false)}
        onSuccess={handleRefetch}
      />
    </div>
  );
}
