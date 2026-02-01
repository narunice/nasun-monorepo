/**
 * TradePage
 * DEX Trading Page - Full width layout for professional trading
 * Pro mode: Horizontal layout (Chart | Orderbook | Order Form)
 * Simple mode: 2-column mobile-friendly layout
 */

import { useQuery } from '@tanstack/react-query';
import { OrderFormProvider, MarketProvider, useMarket } from '../features/trading/context';
import { TradingPanel } from '../features/trading/containers';
import { MarketSelector, BottomTabPanel, MarketInfoBar, PriceChart, Orderbook } from '../features/trading/components';
import { useTradeMode, useOrderbook } from '../features/trading/hooks';
import { useOrderForm } from '../features/trading/context';
import { usePrices } from '../features/core/usePrices';
import { type TokenSymbol } from '../lib/prices';
import { fetchBinance24hTicker, getBinanceSymbol } from '../lib/indicators';

// Fixed height for chart and orderbook to ensure consistent layout
const CHART_HEIGHT = 480;

function TradePageContent() {
  const { mode, toggleMode, isSimple } = useTradeMode();
  const { currentPool } = useMarket();
  const { data: orderbookData } = useOrderbook();
  const { setPrice } = useOrderForm();
  const { getPrice } = usePrices();

  const orderbook = orderbookData?.orderbook ?? { bids: [], asks: [], spread: 0, midPrice: 0 };
  const midPrice = orderbookData?.midPrice ?? 0;

  // Price priority: DeepBook midPrice > oracle/simulated price
  const baseSymbol = currentPool.baseToken.symbol as TokenSymbol;
  const oraclePrice = getPrice(baseSymbol);
  const displayPrice = midPrice || oraclePrice;

  // Fetch real 24h market data from Binance
  const binanceSymbol = getBinanceSymbol(baseSymbol);
  const { data: ticker24h } = useQuery({
    queryKey: ['ticker24h', binanceSymbol],
    queryFn: () => fetchBinance24hTicker(binanceSymbol),
    enabled: !!binanceSymbol,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Market info data
  const marketInfo = {
    symbol: `${currentPool.baseToken.symbol}/${currentPool.quoteToken.symbol}`,
    price: displayPrice,
    priceChange24h: ticker24h?.priceChangePercent ?? 0,
    volume24h: ticker24h?.quoteVolume ?? 0,
    high24h: ticker24h?.highPrice,
    low24h: ticker24h?.lowPrice,
  };

  // Handle orderbook price click
  const handlePriceClick = (price: number) => {
    setPrice(price.toFixed(2));
  };

  return (
    <div className="space-y-3">
      {/* Header: Market Selector + Mode Toggle */}
      <div className="flex items-center justify-between gap-4">
        <MarketSelector />

        {/* Simple/Pro Toggle */}
        <div className="flex items-center gap-2">
          <span className={`text-trading-sm ${isSimple ? 'text-theme-text-primary font-medium' : 'text-theme-text-muted'}`}>
            Simple
          </span>
          <button
            onClick={toggleMode}
            className="relative w-10 h-5 rounded-full transition-colors bg-theme-bg-tertiary"
            aria-label={`Switch to ${isSimple ? 'Pro' : 'Simple'} mode`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
                isSimple
                  ? 'left-0.5 bg-theme-accent'
                  : 'left-5 bg-purple-500'
              }`}
            />
          </button>
          <span className={`text-trading-sm ${!isSimple ? 'text-theme-text-primary font-medium' : 'text-theme-text-muted'}`}>
            Pro
          </span>
        </div>
      </div>

      {/* Market Info Bar */}
      <MarketInfoBar {...marketInfo} />

      {/* Main Trading Grid */}
      {isSimple ? (
        /* Simple Mode: Chart + Trading Panel (2 columns) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
          <div className="bg-theme-bg-secondary rounded-lg p-4">
            <PriceChart currentPrice={displayPrice} />
          </div>
          <TradingPanel mode={mode} />
        </div>
      ) : (
        /* Pro Mode: Full width - Chart | Orderbook | Order Form */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Chart - Takes majority of space */}
          <div
            className="lg:col-span-7 xl:col-span-8 bg-theme-bg-secondary rounded-lg p-3"
            style={{ height: `${CHART_HEIGHT}px` }}
          >
            <PriceChart currentPrice={displayPrice} />
          </div>

          {/* Orderbook - Fixed width, same height as chart */}
          <div
            className="lg:col-span-2 xl:col-span-2 bg-theme-bg-secondary rounded-lg p-3 overflow-hidden"
            style={{ height: `${CHART_HEIGHT}px` }}
          >
            <Orderbook
              orderbook={orderbook}
              onPriceClick={handlePriceClick}
              compact
            />
          </div>

          {/* Trading Panel - Order Form */}
          <div
            className="lg:col-span-3 xl:col-span-2 overflow-y-auto rounded-lg"
            style={{ maxHeight: `${CHART_HEIGHT}px` }}
          >
            <TradingPanel mode={mode} />
          </div>
        </div>
      )}

      {/* Bottom Tab Panel - Pro mode only */}
      {!isSimple && <BottomTabPanel />}
    </div>
  );
}

export function TradePage() {
  return (
    <MarketProvider>
      <OrderFormProvider>
        <TradePageContent />
      </OrderFormProvider>
    </MarketProvider>
  );
}
