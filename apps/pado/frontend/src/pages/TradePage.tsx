/**
 * TradePage
 * DEX Trading Page - Full width layout for professional trading
 * Pro mode: Horizontal layout (Chart | Orderbook | Order Form)
 * Simple mode: 2-column mobile-friendly layout
 */

import { useQuery } from '@tanstack/react-query';
import { OrderFormProvider, MarketProvider, useMarket } from '../features/trading/context';
import { TradingPanel } from '../features/trading/containers';
import { MarketSelector, BottomTabPanel, MarketInfoBar, PriceChart, Orderbook, TradingToggles } from '../features/trading/components';
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
      {/* Header: Market Selector + Info + Toggles
          Desktop (lg+): Row 1 = MarketSelector | Interface toggle
                         Row 2 = MarketInfoBar  | TradingToggles
          Tablet (md-lg): Row 1 = MarketSelector (full)
                          Row 2 = MarketInfoBar (full)
                          Row 3 = Interface toggle | TradingToggles (side by side)
          Mobile (<md):   All stacked vertically */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3">
        {/* MarketSelector — full width on mobile/tablet, left on desktop */}
        <div className="md:col-span-2 lg:col-span-9 xl:col-span-10 order-1">
          <MarketSelector />
        </div>

        {/* Interface Toggle — mobile: row 3 left (or full if Simple), desktop: row 1 right */}
        <div className={`order-3 lg:order-2 lg:col-span-3 xl:col-span-2 ${isSimple ? 'md:col-span-2' : ''}`}>
          <div className="bg-theme-bg-secondary rounded-lg px-3 py-3 h-full flex items-center justify-between">
            <span className="text-xs xl:text-sm text-theme-text-muted whitespace-nowrap">Interface</span>
            <div className="flex items-center gap-2">
              <span className={`text-trading-sm ${isSimple ? 'text-theme-text-primary font-medium' : 'text-theme-text-muted'}`}>
                Simple
              </span>
              <button
                onClick={toggleMode}
                className={`w-7 h-3.5 rounded-full transition-colors ${
                  isSimple ? 'bg-theme-toggle-off' : 'bg-purple-500'
                }`}
                aria-label={`Switch to ${isSimple ? 'Pro' : 'Simple'} mode`}
              >
                <span
                  className={`block w-3 h-3 rounded-full bg-white transition-transform ${
                    isSimple ? 'translate-x-0.5' : 'translate-x-3.5'
                  }`}
                />
              </button>
              <span className={`text-trading-sm ${!isSimple ? 'text-theme-text-primary font-medium' : 'text-theme-text-muted'}`}>
                Pro
              </span>
            </div>
          </div>
        </div>

        {/* MarketInfoBar — full width on mobile row 2, left on desktop row 2 */}
        <div className="md:col-span-2 lg:col-span-9 xl:col-span-10 order-2 lg:order-3">
          <MarketInfoBar {...marketInfo} />
        </div>

        {/* TradingToggles (Pro only) — mobile: row 3 right, desktop: row 2 right */}
        {!isSimple && (
          <div className="order-4 lg:col-span-3 xl:col-span-2">
            <TradingToggles />
          </div>
        )}
      </div>

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
        /* Pro Mode: 2-row grid with Order Form spanning both rows */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Row 1 Left: Chart */}
          <div
            className="lg:col-span-7 xl:col-span-8 bg-theme-bg-secondary rounded-lg p-3"
            style={{ height: `${CHART_HEIGHT}px` }}
          >
            <PriceChart currentPrice={displayPrice} />
          </div>

          {/* Row 1 Middle: Orderbook */}
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

          {/* Right: Order Form — spans row 1 + row 2 */}
          <div className="lg:col-span-3 xl:col-span-2 lg:row-span-2 rounded-lg">
            <TradingPanel mode={mode} />
          </div>

          {/* Row 2 Left: Bottom Tab Panel */}
          <div className="lg:col-span-9 xl:col-span-10">
            <BottomTabPanel />
          </div>
        </div>
      )}
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
