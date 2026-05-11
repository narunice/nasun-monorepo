/**
 * PredictMarketPage (round-6 plan §2.17)
 *
 * Layout grid:
 *  - Desktop ≥1280px (xl): 60/40 split
 *  - Desktop 1024-1280px (lg): 67/33
 *  - Mobile <1024px: stacked accordion
 *
 * Wires the full v1 lifecycle UI: ResolverDisclaimerBanner, MarketHeader,
 * ResolutionMetaPanel, CancelExpiredMarketCTA, OutcomeOrderbook, PositionList,
 * AdminResolveModal — and lifts orderbook click state into the form's controlled
 * `clickVersion` so user typing is not clobbered.
 */

import { useParams, Link } from 'react-router-dom';
import { useState, useCallback, useMemo } from 'react';
import {
  useMarket,
  useMarketOrderbook,
  usePredictionPositions,
  usePredictionAdmin,
  useLastTradePrice,
  MarketHeader,
  OutcomeOrderbook,
  OutcomeOrderForm,
  PositionList,
  AdminResolveModal,
  CancelExpiredMarketCTA,
  ResolverDisclaimerBanner,
  ResolutionMetaPanel,
  MyOpenOrdersList,
  MyTradeHistory,
  RecentTradesFeed,
  MobileTradeStickyBar,
  WinningClaimBanner,
  type PredictionMarket,
} from '../features/prediction';
import { calculateProbabilityFromOrderbook } from '../features/prediction/types';
import { usePredictionEventBridge } from '../features/prediction/hooks/usePredictionEventBridge';
import { useNow } from '@/hooks/useNow';
import { Spinner } from '../components/common';
export function PredictMarketPage() {
  // Wire prediction_market events → react-query cache invalidations. Mounting
  // here means the bridge is alive whenever the user is on a market detail
  // page; if /predict gets a layout route in the future, move this up so it
  // also covers the list page without needing two subscriptions.
  usePredictionEventBridge();

  const { marketId } = useParams<{ marketId: string }>();
  const { market, isLoading, error, refetch: refetchMarket } = useMarket(marketId);
  const { yesOrderbook, noOrderbook, refetch: refetchOrderbook } = useMarketOrderbook(marketId);
  const { positions, isLoading: isPositionsLoading, refetch: refetchPositions } = usePredictionPositions(marketId);
  const { isResolver } = usePredictionAdmin();
  const lastTradePriceBps = useLastTradePrice(marketId);
  const now = useNow();

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [clickedPrice, setClickedPrice] = useState<number | null>(null);
  const [clickedOutcome, setClickedOutcome] = useState<'yes' | 'no' | null>(null);
  const [clickVersion, setClickVersion] = useState(0);

  const handleRefetch = useCallback(() => {
    refetchMarket();
    refetchOrderbook();
    refetchPositions();
  }, [refetchMarket, refetchOrderbook, refetchPositions]);

  const handlePriceClick = useCallback((isYes: boolean, price: number) => {
    setClickedOutcome(isYes ? 'yes' : 'no');
    setClickedPrice(price);
    setClickVersion((v) => v + 1);
  }, []);

  const handleTradeSuccess = useCallback(() => {
    handleRefetch();
  }, [handleRefetch]);

  const handleMobileOutcomeSelect = useCallback((outcome: 'yes' | 'no') => {
    setClickedOutcome(outcome);
    setClickVersion((v) => v + 1);
  }, []);

  const { yesProbability, noProbability } = useMemo(
    () => calculateProbabilityFromOrderbook(yesOrderbook ?? null, noOrderbook ?? null, lastTradePriceBps),
    [yesOrderbook, noOrderbook, lastTradePriceBps],
  );

  const isTradingFrozen = !!market &&
    market.status === 'open' &&
    now >= market.closeTime &&
    now < market.resolveDeadline;


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
        <Link to="/predict" className="text-pd3 hover:text-pd3 underline">
          Back to Markets
        </Link>
      </div>
    );
  }

  const ogUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/predict/${market.id}`
      : `https://pado.nasun.io/predict/${market.id}`;

  return (
    <div className="space-y-4 md:space-y-6 pb-32 lg:pb-0">
      {/* React 19 hoists these into <head> automatically. */}
      <title>{`${market.question} — Pado Prediction Markets`}</title>
      <meta property="og:title" content={market.question} />
      <meta property="og:description" content="Trade YES or NO on Pado Prediction Markets" />
      <meta property="og:url" content={ogUrl} />
      <meta property="og:image" content="/Nasun-OG.png" />
      <meta name="twitter:card" content="summary_large_image" />

      <Link
        to="/predict"
        className="inline-flex items-center gap-2 text-sm text-theme-text-secondary hover:text-theme-text-primary transition-colors min-h-[40px]"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Markets
      </Link>

      <ResolverDisclaimerBanner />

      {market.status === 'open' ? (
        /* Active market: 2-column layout with orderbook + trade form */
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] xl:grid-cols-[3fr_2fr] gap-4 md:gap-6">
          <main className="space-y-4 md:space-y-6 order-2 lg:order-1">
            <MarketHeader market={market} yesOrderbook={yesOrderbook} noOrderbook={noOrderbook} lastTradePriceBps={lastTradePriceBps} />

            <ResolutionMetaPanel market={market} />

            <CancelExpiredMarketCTA market={market} now={now} onSuccess={handleRefetch} />

            <div data-tour="prediction-orderbook">
              <OutcomeOrderbook
                yesOrderbook={yesOrderbook}
                noOrderbook={noOrderbook}
                onPriceClick={handlePriceClick}
              />
            </div>

            <RecentTradesFeed marketId={market.id} />

            {isResolver && (
              <div className="bg-theme-bg-secondary rounded-xl p-4 border border-yellow-500/30">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-theme-text-primary">Admin Actions</h3>
                    <p className="text-sm text-theme-text-muted">
                      You are the designated resolver for this market
                    </p>
                  </div>
                  <button
                    onClick={() => setShowResolveModal(true)}
                    disabled={now < market.closeTime || now > market.resolveDeadline}
                    className="w-full sm:w-auto px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {now < market.closeTime
                      ? 'Wait for Close Time'
                      : now > market.resolveDeadline
                        ? 'Deadline expired'
                        : 'Resolve Market'}
                  </button>
                </div>
              </div>
            )}

            <MarketInfoPanel market={market} />
          </main>

          <aside id="trade-form" className="space-y-4 md:space-y-6 order-1 lg:order-2 scroll-mt-4">
            <div data-tour="prediction-order-form">
              <OutcomeOrderForm
                market={market}
                yesOrderbook={yesOrderbook}
                noOrderbook={noOrderbook}
                clickedPrice={clickedPrice}
                clickedOutcome={clickedOutcome}
                clickVersion={clickVersion}
                isTradingFrozen={isTradingFrozen}
                onSuccess={handleTradeSuccess}
              />
            </div>
            <div data-tour="prediction-positions">
              <PositionList market={market} positions={positions} isLoading={isPositionsLoading} onSuccess={handleRefetch} />
            </div>
            <MyOpenOrdersList market={market} />
            <MyTradeHistory marketId={market.id} />
          </aside>
        </div>
      ) : (
        /* Resolved / Cancelled market: single-column, outcome-first layout */
        <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
          <MarketHeader market={market} yesOrderbook={yesOrderbook} noOrderbook={noOrderbook} lastTradePriceBps={lastTradePriceBps} />
          <ResolutionMetaPanel market={market} />
          <WinningClaimBanner market={market} positions={positions} onSettled={handleRefetch} />
          <PositionList market={market} positions={positions} isLoading={isPositionsLoading} onSuccess={handleRefetch} />
          <MarketInfoPanel market={market} />
        </div>
      )}

      {market.status === 'open' && <AdminResolveModal
        market={market}
        isOpen={showResolveModal}
        onClose={() => setShowResolveModal(false)}
        onSuccess={handleRefetch}
      />}

      {market.status === 'open' && (
        <MobileTradeStickyBar
          yesProbability={yesProbability}
          noProbability={noProbability}
          marketStatus={market.status}
          isTradingFrozen={isTradingFrozen}
          onSelectOutcome={handleMobileOutcomeSelect}
        />
      )}

    </div>
  );
}

function MarketInfoPanel({ market }: { market: PredictionMarket }) {
  return (
    <div className="bg-theme-bg-secondary rounded-xl p-4">
      <h3 className="text-base md:text-lg font-semibold text-theme-text-primary mb-3 md:mb-4">
        Market Info
      </h3>
      <div className="grid grid-cols-2 gap-3 md:gap-4 text-sm">
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
            <div>{new Date(market.closeTime).toLocaleString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
              timeZone: 'UTC', timeZoneName: 'short',
            })}</div>
            <div className="text-theme-text-muted text-sm mt-0.5">
              <span className="text-theme-text-muted/60">Your time: </span>
              {new Date(market.closeTime).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
              })}
            </div>
          </div>
        </div>
        <div>
          <div className="text-theme-text-muted">Status</div>
          <div className="text-theme-text-secondary capitalize">{market.status}</div>
        </div>
      </div>
    </div>
  );
}
