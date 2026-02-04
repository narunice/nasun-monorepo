/**
 * TradePage
 * DEX Trading Page - Full width layout for professional trading
 * Pro mode: Chart+BottomTab | Orderbook+News | OrderForm+Chat (3 columns)
 * Simple mode: Chart | OrderForm+Chat (2 columns)
 *
 * Right-side cards share fixed width (CARD_W).
 * Header toggle bars (Interface, TradingToggles) also use CARD_W
 * and are right-aligned to match the rightmost card.
 */

import { useQuery } from '@tanstack/react-query';
import { OrderFormProvider, MarketProvider, useMarket } from '../features/trading/context';
import { TradingPanel, EnablePadoCard } from '../features/trading/containers';
import { MarketSelector, BottomTabPanel, MarketInfoBar, PriceChart, Orderbook, TradingToggles } from '../features/trading/components';
import { useTradeMode, useOrderbook } from '../features/trading/hooks';
import { useOrderForm } from '../features/trading/context';
import { usePrices } from '../features/core/usePrices';
import { type TokenSymbol } from '../lib/prices';
import { fetchBinance24hTicker, getBinanceSymbol } from '../lib/indicators';
import { useState } from 'react';
import { ChatPanel, MobileChatDrawer, useChatPanel, FloatingChatPopup } from '../features/social';
import { NewsCarousel } from '../features/news';

// Fixed height for chart and orderbook to ensure consistent layout
const CHART_HEIGHT = 480;
// Chat panel height when expanded (below chart area)
const CHAT_HEIGHT = 280;

// Per-card width — shared by each right-side card and header toggles
const CARD_W = 'w-[250px] 2xl:w-[280px]';

function ChatCollapsedBar({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-theme-bg-secondary rounded-lg px-3 py-2
        flex items-center justify-between
        border border-theme-border
        text-theme-text-muted hover:text-theme-text-primary transition-colors"
    >
      <div className="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="text-trading-sm font-medium">Chat</span>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

function TradePageContent() {
  const { mode, toggleMode, isSimple } = useTradeMode();
  const { isVisible: chatVisible, toggle: toggleChat } = useChatPanel();
  const [chatFloating, setChatFloating] = useState(false);
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
      {/* Header Row 1: MarketSelector | Interface toggle (1 card width, right-aligned) */}
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <MarketSelector />
        </div>
        <div className={`hidden xl:block shrink-0 ${CARD_W}`}>
          <div className="bg-theme-bg-secondary rounded-lg px-3 py-3 h-full flex items-center justify-between">
            <span className="text-xs text-theme-text-muted whitespace-nowrap">Interface</span>
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
      </div>

      {/* Header Row 2: MarketInfoBar | TradingToggles (1 card width, right-aligned) */}
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <MarketInfoBar {...marketInfo} />
        </div>
        {!isSimple && (
          <div className={`hidden xl:block shrink-0 ${CARD_W}`}>
            <TradingToggles />
          </div>
        )}
      </div>

      {/* Mobile-only: Interface toggle (visible below xl) */}
      <div className="xl:hidden">
        <div className="bg-theme-bg-secondary rounded-lg px-3 py-3 flex items-center justify-between">
          <span className="text-xs text-theme-text-muted">Interface</span>
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
        {!isSimple && <div className="mt-3"><TradingToggles /></div>}
      </div>

      {/* Main Trading Area (xl+): Chart + cards side by side */}
      {isSimple ? (
        /* Simple mode: Chart (left) | OrderForm+Chat (right) — 2 columns */
        <div className="hidden xl:flex gap-3">
          <div className="flex-1 min-w-0" style={{ height: `${CHART_HEIGHT}px` }}>
            <PriceChart currentPrice={displayPrice} />
          </div>
          <div className={`shrink-0 ${CARD_W} flex flex-col gap-3`}>
            <div className="overflow-y-auto" style={{ height: `${CHART_HEIGHT}px` }}>
              <TradingPanel mode={mode} />
            </div>
            {!chatFloating && (
              chatVisible ? (
                <div style={{ height: `${CHAT_HEIGHT}px` }}>
                  <ChatPanel onMinimize={toggleChat} onPopOut={() => setChatFloating(true)} />
                </div>
              ) : (
                <ChatCollapsedBar onClick={toggleChat} />
              )
            )}
          </div>
        </div>
      ) : (
        /* Pro mode: Chart+BottomTab | Orderbook+News | OrderForm+Chat — 3 columns */
        <div className="hidden xl:flex gap-3">
          {/* Col 1 (flex): Chart + BottomTab */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div style={{ height: `${CHART_HEIGHT}px` }}>
              <PriceChart currentPrice={displayPrice} />
            </div>
            <div style={{ height: `${CHAT_HEIGHT}px` }}>
              <BottomTabPanel className="h-full" />
            </div>
          </div>
          {/* Col 2 (CARD_W): Orderbook + News */}
          <div className={`shrink-0 ${CARD_W} flex flex-col gap-3`}>
            <div
              className="bg-theme-bg-secondary rounded-lg p-3 overflow-hidden"
              style={{ height: `${CHART_HEIGHT}px` }}
            >
              <Orderbook
                orderbook={orderbook}
                onPriceClick={handlePriceClick}
                compact
              />
            </div>
            <div style={{ height: `${CHAT_HEIGHT}px` }}>
              <NewsCarousel />
            </div>
          </div>
          {/* Col 3 (CARD_W): EnablePado + OrderForm + Chat */}
          <div className={`shrink-0 ${CARD_W} flex flex-col gap-3`}>
            <EnablePadoCard />
            <div className="overflow-y-auto" style={{ height: `${CHART_HEIGHT}px` }}>
              <TradingPanel mode={mode} />
            </div>
            {!chatFloating && (
              chatVisible ? (
                <div style={{ height: `${CHAT_HEIGHT}px` }}>
                  <ChatPanel onMinimize={toggleChat} onPopOut={() => setChatFloating(true)} />
                </div>
              ) : (
                <ChatCollapsedBar onClick={toggleChat} />
              )
            )}
          </div>
        </div>
      )}

      {/* Medium layout (lg to xl): Chart full width + OrderBook|OrderForm side by side */}
      <div className="hidden lg:block xl:hidden space-y-3">
        {isSimple ? (
          <>
            <div style={{ height: `${CHART_HEIGHT}px` }}>
              <PriceChart currentPrice={displayPrice} />
            </div>
            <TradingPanel mode={mode} />
          </>
        ) : (
          <>
            <div style={{ height: `${CHART_HEIGHT}px` }}>
              <PriceChart currentPrice={displayPrice} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="bg-theme-bg-secondary rounded-lg p-3" style={{ height: '400px' }}>
                  <Orderbook
                    orderbook={orderbook}
                    onPriceClick={handlePriceClick}
                  />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <TradingPanel mode={mode} />
              </div>
            </div>
            <BottomTabPanel />
          </>
        )}
      </div>

      {/* Mobile: stacked panels (below lg) */}
      <div className="lg:hidden space-y-3">
        {isSimple ? (
          <div style={{ height: `${CHART_HEIGHT}px` }}>
            <PriceChart currentPrice={displayPrice} />
          </div>
        ) : (
          <>
            <div style={{ height: `${CHART_HEIGHT}px` }}>
              <PriceChart currentPrice={displayPrice} />
            </div>
            <div className="bg-theme-bg-secondary rounded-lg p-3" style={{ height: '400px' }}>
              <Orderbook
                orderbook={orderbook}
                onPriceClick={handlePriceClick}
              />
            </div>
            <BottomTabPanel />
          </>
        )}
        <TradingPanel mode={mode} />
      </div>

      {/* Floating chat popup (xl+ only, when popped out) */}
      {chatFloating && (
        <div className="hidden xl:block">
          <FloatingChatPopup onDock={() => setChatFloating(false)} />
        </div>
      )}

      {/* Chat drawer (below xl) — available at both lg-xl and mobile */}
      <MobileChatDrawer />
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
